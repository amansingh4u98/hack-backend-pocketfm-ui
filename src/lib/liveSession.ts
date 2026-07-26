import type { LiveClientEvent, LiveServerEvent } from '../types'
import { Room, RoomEvent, Track } from 'livekit-client'

/**
 * One WebSocket per call, not per turn.
 *
 * The previous client opened a socket, submitted one message, waited for the
 * reply, sent `session.leave` and closed — every turn. That works for
 * request/response text and cannot work for a call:
 *
 *   - every turn pays a fresh handshake;
 *   - there is no channel for writer microphone audio;
 *   - the server's reconnect/replay support goes unused;
 *   - with ROOM_LEASES_ENABLED the second turn is rejected 4409, because a
 *     lease is held per session and the first socket still owns it.
 *
 * This client holds the socket open for the lifetime of the call, replays
 * missed events after a drop, and surfaces binary audio frames instead of
 * discarding them.
 */

const PING_INTERVAL_MS = 20_000 // server idle timeout defaults to 45s
const TURN_TIMEOUT_MS = 45_000
const JOIN_TIMEOUT_MS = 10_000
const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 8_000
const MAX_RECONNECT_ATTEMPTS = 6

export interface AudioFrame {
  turnId: string
  streamId: string
  agentId: string | null
  sequence: number
  codec: string
  sampleRateHz: number
  channels: number
  presentationTimeMs: number
  isFinal: boolean
  /** Raw PCM payload. Decoding and playback belong to the audio layer. */
  data: ArrayBuffer
}

export interface TurnResult {
  reply: string
  agentId?: string
  turnId?: string
}

export type ConnectionState =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'

interface SessionConfig {
  apiBase: string
  roomId: string
  sessionId: string
  token: string
}

interface Handlers {
  onEvent?: (event: LiveServerEvent) => void
  onAudio?: (frame: AudioFrame) => void
  onStateChange?: (state: ConnectionState) => void
  onTextDelta?: (text: string, agentId?: string, turnId?: string) => void
  onMediaState?: (state: LiveMediaState) => void
}

export type MediaProvider = 'livekit' | 'websocket_fallback' | 'pending'

export interface LiveParticipantState {
  id: string
  name: string
  connected: boolean
  isLocal: boolean
  isSpeaking: boolean
  isMuted: boolean
  hasAudioTrack: boolean
}

export interface LiveMediaState {
  provider: MediaProvider
  connected: boolean
  error?: string
  microphoneMuted: boolean
  activeSpeakerIds: string[]
  participants: LiveParticipantState[]
  trackIds: string[]
}

interface OpenTurn {
  resolve: (result: TurnResult) => void
  reject: (error: Error) => void
  buffer: string
  agentId?: string
  turnId?: string
  timer: number
}

function socketUrl(
  base: string,
  roomId: string,
  sessionId: string,
  token: string,
  afterSequence: number | null,
): string {
  const path = `/v1/rooms/${roomId}/sessions/${sessionId}/live`
  let origin: string
  if (base) {
    origin = base.replace(/^http/, 'ws')
  } else {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    origin = `${proto}//${window.location.host}/api`
  }
  const params = new URLSearchParams({ token })
  if (afterSequence !== null) {
    params.set('after_sequence', String(afterSequence))
  }
  return `${origin}${path}?${params.toString()}`
}

export class LiveSessionClient {
  private socket: WebSocket | null = null
  private state: ConnectionState = 'closed'
  private joined = false
  private closing = false
  private lastSequence: number | null = null
  private reconnectAttempts = 0
  private pingTimer: number | null = null
  private joinWaiters: Array<() => void> = []
  private outbox: LiveClientEvent[] = []
  private turn: OpenTurn | null = null
  private latestActiveTurnId: string | null = null
  private lkRoom: Room | null = null
  private lkConnectPromise: Promise<void> | null = null
  private mediaProvider: MediaProvider = 'pending'
  private mediaConnected = false
  private mediaError: string | undefined
  private microphoneMuted = true
  private speechLanguageCode: string | null = null
  private activeSpeakerIds: string[] = []
  private mediaParticipants = new Map<string, LiveParticipantState>()
  private trackIds = new Set<string>()
  private attachedAudio = new Map<string, HTMLMediaElement>()
  private ticketRefreshTimer: number | null = null
  private readonly subscribers = new Set<Handlers>()

  private readonly config: SessionConfig
  constructor(config: SessionConfig) {
    this.config = config
  }

  get connectionState(): ConnectionState {
    return this.state
  }

  get token(): string {
    return this.config.token
  }

  get mediaState(): LiveMediaState {
    return this.buildMediaState()
  }

  get usesWebSocketAudioFallback(): boolean {
    return this.mediaProvider === 'websocket_fallback'
  }

  subscribe(handlers: Handlers): () => void {
    this.subscribers.add(handlers)
    handlers.onStateChange?.(this.state)
    handlers.onMediaState?.(this.buildMediaState())
    return () => this.subscribers.delete(handlers)
  }

  async connect(): Promise<void> {
    if (this.socket && this.state !== 'closed') return
    this.closing = false
    this.openSocket()
    await this.waitForJoin()
  }

  /** Submit a writer turn and resolve when the character finishes replying. */
  async sendText(message: string): Promise<TurnResult> {
    if (this.turn) {
      throw new Error('A turn is already in flight')
    }
    await this.connect()

    return new Promise<TurnResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        const pending = this.turn
        this.turn = null
        pending?.reject(new Error('Turn timed out'))
      }, TURN_TIMEOUT_MS)

      this.turn = { resolve, reject, buffer: '', timer }
      this.send({
        schema_version: '1.0',
        event_id: crypto.randomUUID(),
        type: 'user.transcript.submit',
        turn_id: crypto.randomUUID(),
        stream_id: crypto.randomUUID(),
        text: message,
      })
    })
  }

  /** Barge-in on the turn currently streaming. */
  interrupt(turnId?: string): void {
    const target = turnId ?? this.turn?.turnId ?? this.latestActiveTurnId
    if (!target) return
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'turn.interrupt',
      turn_id: target,
    })
  }

  startDiscussion(characterIds: string[], maxAgentTurns = 4): void {
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'discussion.start',
      participant_ids: characterIds,
      max_agent_turns: maxAgentTurns,
    })
  }

  setSpeechLanguage(languageCode: string | null): void {
    this.speechLanguageCode = languageCode
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'writer.language.set',
      language_code: languageCode,
    })
  }

  stopDiscussion(): void {
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'discussion.stop',
    })
  }

  requestFinalization(): void {
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'story.finalization.request',
    })
  }

  respondToFinalization(
    proposalId: string,
    decision: 'confirm' | 'revise' | 'reject',
    revisionNotes?: string,
  ): void {
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'story.finalization.respond',
      proposal_id: proposalId,
      decision,
      ...(revisionNotes?.trim() ? { revision_notes: revisionNotes.trim() } : {}),
    })
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<MediaProvider> {
    this.microphoneMuted = !enabled
    if (this.mediaProvider === 'livekit') {
      await this.lkConnectPromise
      if (!this.lkRoom) throw new Error('LiveKit room is unavailable')
      await this.lkRoom.localParticipant.setMicrophoneEnabled(enabled, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      })
      this.syncLiveKitState()
    } else {
      this.emitMediaState()
    }
    return this.mediaProvider
  }

  async startAudioPlayback(): Promise<void> {
    if (!this.lkRoom) return
    await this.lkRoom.startAudio()
    await Promise.all(
      [...this.attachedAudio.values()].map((element) => element.play()),
    )
    this.mediaError = undefined
    this.emitMediaState()
  }

  sendAudioStart(turnId: string, streamId: string): void {
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'writer.audio.start',
      turn_id: turnId,
      stream_id: streamId,
      audio_format: 'pcm_16000',
      sample_rate_hz: 16000,
      ...(this.speechLanguageCode
        ? { language_code: this.speechLanguageCode }
        : {}),
    })
  }

  sendAudioStop(streamId: string): void {
    this.send({
      schema_version: '1.0',
      event_id: crypto.randomUUID(),
      type: 'writer.audio.stop',
      stream_id: streamId,
    })
  }

  sendBinary(data: ArrayBuffer): void {
    if (!this.joined || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // For binary data, dropping is safer than queuing unbounded PCM arrays
      // while reconnecting.
      return
    }
    this.socket.send(data)
  }

  close(): void {
    this.closing = true
    this.clearPing()
    this.clearTicketRefresh()
    this.failOpenTurn(new Error('Session closed'))
    const socket = this.socket
    this.socket = null
    
    if (this.lkRoom) {
      this.lkRoom.disconnect()
      this.lkRoom = null
    }
    for (const element of this.attachedAudio.values()) element.remove()
    this.attachedAudio.clear()

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(
          JSON.stringify({
            schema_version: '1.0',
            event_id: crypto.randomUUID(),
            type: 'session.leave',
          }),
        )
      } catch {
        /* already gone */
      }
    }
    try {
      socket?.close()
    } catch {
      /* already gone */
    }
    this.setState('closed')
  }

  // ---------------------------------------------------------------- internals

  private connectLiveKit(url: string, token: string): void {
    if (this.lkRoom || this.lkConnectPromise) return
    const room = new Room()
    this.lkRoom = room

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach()
        element.autoplay = true
        element.muted = false
        element.volume = 1
        element.style.display = 'none'
        document.body.appendChild(element)
        if (track.sid) this.attachedAudio.set(track.sid, element)
        void this.startAudioPlayback().catch((error: unknown) => {
          this.mediaError =
            error instanceof Error
              ? error.message
              : 'Click Unmute once to enable room audio'
          this.emitMediaState()
        })
      }
      this.syncLiveKitState()
    })
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      const element = track.sid ? this.attachedAudio.get(track.sid) : undefined
      if (element) {
        track.detach(element)
        element.remove()
        if (track.sid) this.attachedAudio.delete(track.sid)
      }
      this.syncLiveKitState()
    })
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.activeSpeakerIds = speakers.map((speaker) =>
        normalizeParticipantIdentity(speaker.identity),
      )
      this.syncLiveKitState()
    })
    room.on(RoomEvent.ParticipantConnected, () => this.syncLiveKitState())
    room.on(RoomEvent.ParticipantDisconnected, () => this.syncLiveKitState())
    room.on(RoomEvent.Reconnected, () => {
      this.mediaConnected = true
      this.mediaError = undefined
      this.syncLiveKitState()
    })
    room.on(RoomEvent.Disconnected, () => {
      this.mediaConnected = false
      this.emitMediaState()
    })
    room.on(RoomEvent.TrackPublished, () => this.syncLiveKitState())
    room.on(RoomEvent.TrackUnpublished, () => this.syncLiveKitState())
    room.on(RoomEvent.LocalTrackPublished, () => this.syncLiveKitState())
    room.on(RoomEvent.LocalTrackUnpublished, () => this.syncLiveKitState())

    this.lkConnectPromise = room
      .connect(url, token)
      .then(async () => {
        this.mediaConnected = true
        this.mediaError = undefined
        if (!this.microphoneMuted) {
          await room.localParticipant.setMicrophoneEnabled(true, {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          })
        }
        this.syncLiveKitState()
      })
      .catch((error: unknown) => {
        console.warn('[livekit] failed to connect to room:', error)
        this.mediaConnected = false
        this.mediaError =
          error instanceof Error ? error.message : 'LiveKit audio connection failed'
        this.lkRoom = null
        this.emitMediaState()
        throw error
      })
  }

  private syncLiveKitState(): void {
    const room = this.lkRoom
    if (!room) return
    const participants = [room.localParticipant, ...room.remoteParticipants.values()]
    this.mediaParticipants.clear()
    this.trackIds.clear()

    for (const participant of participants) {
      const id = normalizeParticipantIdentity(participant.identity)
      const publications = [...participant.trackPublications.values()].filter(
        (publication) => publication.kind === Track.Kind.Audio,
      )
      for (const publication of publications) {
        if (publication.trackSid) this.trackIds.add(publication.trackSid)
      }
      this.mediaParticipants.set(id, {
        id,
        name: participant.name || humanizeIdentity(id),
        connected: true,
        isLocal: participant === room.localParticipant,
        isSpeaking: this.activeSpeakerIds.includes(id) || participant.isSpeaking,
        isMuted:
          participant === room.localParticipant
            ? this.microphoneMuted
            : publications.length === 0 || publications.every((publication) => publication.isMuted),
        hasAudioTrack: publications.length > 0,
      })
    }
    this.emitMediaState()
  }

  private buildMediaState(): LiveMediaState {
    return {
      provider: this.mediaProvider,
      connected:
        this.mediaProvider === 'websocket_fallback' || this.mediaConnected,
      error: this.mediaError,
      microphoneMuted: this.microphoneMuted,
      activeSpeakerIds: [...this.activeSpeakerIds],
      participants: [...this.mediaParticipants.values()],
      trackIds: [...this.trackIds],
    }
  }

  private emitMediaState(): void {
    this.emitToSubscribers('onMediaState', this.buildMediaState())
  }

  private emitToSubscribers(key: keyof Handlers, ...args: unknown[]): void {
    for (const subscriber of this.subscribers) {
      const callback = subscriber[key] as
        | ((...callbackArgs: unknown[]) => void)
        | undefined
      callback?.(...args)
    }
  }

  private scheduleTicketRefresh(expiresInSeconds: number): void {
    this.clearTicketRefresh()
    const safeTtl = Number.isFinite(expiresInSeconds) ? expiresInSeconds : 300
    const refreshInMs = Math.max(10_000, (safeTtl - Math.min(60, safeTtl / 4)) * 1000)
    this.ticketRefreshTimer = window.setTimeout(() => {
      if (this.closing) return
      this.send({
        schema_version: '1.0',
        event_id: crypto.randomUUID(),
        type: 'session.ticket.refresh',
      })
    }, refreshInMs)
  }

  private clearTicketRefresh(): void {
    if (this.ticketRefreshTimer !== null) {
      window.clearTimeout(this.ticketRefreshTimer)
      this.ticketRefreshTimer = null
    }
  }

  private openSocket(): void {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    this.joined = false

    const socket = new WebSocket(
      socketUrl(
        this.config.apiBase,
        this.config.roomId,
        this.config.sessionId,
        this.config.token,
        this.lastSequence,
      ),
    )
    // Without this, binary frames arrive as Blob and cannot be read
    // synchronously — which is how they came to be dropped in the first place.
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    socket.onopen = () => {
      this.reconnectAttempts = 0
      this.setState('open')
      this.startPing()
    }
    socket.onmessage = (ev) => this.handleMessage(ev)
    socket.onerror = () => {
      /* onclose always follows; handle there so we retry once, not twice */
    }
    socket.onclose = (ev) => this.handleClose(ev)
  }

  private handleMessage(ev: MessageEvent): void {
    if (ev.data instanceof ArrayBuffer) {
      const frame = decodeAudioFrame(ev.data)
      if (frame) this.emitToSubscribers('onAudio', frame)
      return
    }
    if (typeof ev.data !== 'string') return

    let event: LiveServerEvent
    try {
      event = JSON.parse(ev.data) as LiveServerEvent
    } catch {
      return
    }

    // Track the highest sequence so a reconnect can ask for the gap only.
    const seq = (event as { sequence?: number }).sequence
    if (typeof seq === 'number') {
      this.lastSequence =
        this.lastSequence === null ? seq : Math.max(this.lastSequence, seq)
    }
    this.emitToSubscribers('onEvent', event)

    switch (event.type) {
      case 'session.joined': {
        this.joined = true
        this.flushOutbox()
        this.joinWaiters.splice(0).forEach((resolve) => resolve())

        const media = event.media as Record<string, unknown> | undefined
        this.mediaProvider =
          media?.provider === 'livekit' ? 'livekit' : 'websocket_fallback'
        this.emitMediaState()
        if (
          this.mediaProvider === 'livekit' &&
          typeof media?.url === 'string' &&
          typeof media.token === 'string'
        ) {
          this.connectLiveKit(media.url, media.token)
        }
        this.scheduleTicketRefresh(tokenSecondsRemaining(this.config.token))

        return
      }

      case 'session.ticket.refreshed': {
        if (typeof event.token === 'string') {
          this.config.token = event.token
          this.scheduleTicketRefresh(
            typeof event.expires_in_seconds === 'number'
              ? event.expires_in_seconds
              : tokenSecondsRemaining(event.token),
          )
        }
        return
      }

      case 'speaker.selected': {
        this.latestActiveTurnId = event.turn_id ? String(event.turn_id) : null
        return
      }

      case 'agent.text.delta': {
        const text = String(event.text || '')
        if (this.turn) {
          this.turn.buffer += text
          if (event.agent_id) this.turn.agentId = String(event.agent_id)
          if (event.turn_id) this.turn.turnId = String(event.turn_id)
        }
        this.emitToSubscribers(
          'onTextDelta',
          text,
          event.agent_id ? String(event.agent_id) : undefined,
          event.turn_id ? String(event.turn_id) : undefined,
        )
        return
      }

      case 'agent.turn.completed':
      case 'agent.text.completed': {
        const reply = this.turn?.buffer.trim() ?? ''
        // text.completed can arrive before any deltas on a TTS-only path;
        // wait for turn.completed rather than resolving empty.
        if (!reply && event.type === 'agent.text.completed') return
        this.resolveOpenTurn({
          reply,
          agentId: this.turn?.agentId,
          turnId: this.turn?.turnId ?? (event.turn_id as string | undefined),
        })
        if (event.type === 'agent.turn.completed') this.latestActiveTurnId = null
        return
      }

      case 'agent.turn.cancelled':
      case 'turn.interrupted': {
        const partial = this.turn?.buffer.trim() ?? ''
        if (partial) {
          this.resolveOpenTurn({
            reply: partial,
            agentId: this.turn?.agentId,
            turnId: this.turn?.turnId,
          })
        }
        this.latestActiveTurnId = null
        return
      }

      case 'agent.turn.failed':
      case 'error':
        if (event.type === 'agent.turn.failed') this.latestActiveTurnId = null
        this.failOpenTurn(
          new Error(String(event.message || event.code || 'Live room error')),
        )
        return

      default:
        return
    }
  }

  private handleClose(ev: CloseEvent): void {
    this.clearPing()
    this.socket = null
    this.joined = false

    if (this.closing) {
      this.setState('closed')
      return
    }

    // 4401/4403 auth, 4409 lease conflict — retrying cannot help.
    if (ev.code === 4401 || ev.code === 4403 || ev.code === 4409) {
      this.failOpenTurn(
        new Error(`Live room closed: ${ev.reason || ev.code}`),
      )
      this.setState('closed')
      return
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.failOpenTurn(new Error('Live room unreachable'))
      this.setState('closed')
      return
    }

    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
    )
    this.reconnectAttempts += 1
    this.setState('reconnecting')
    window.setTimeout(() => {
      if (!this.closing) this.openSocket()
    }, delay)
  }

  private send(event: LiveClientEvent): void {
    if (!this.joined || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Queue rather than race `session.joined`. The old client slept 80ms and
      // hoped.
      this.outbox.push(event)
      return
    }
    this.socket.send(JSON.stringify(event))
  }

  private flushOutbox(): void {
    const pending = this.outbox.splice(0)
    for (const event of pending) {
      try {
        this.socket?.send(JSON.stringify(event))
      } catch {
        this.outbox.push(event)
      }
    }
  }

  private waitForJoin(): Promise<void> {
    if (this.joined) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('Timed out waiting for session.joined'))
      }, JOIN_TIMEOUT_MS)
      this.joinWaiters.push(() => {
        window.clearTimeout(timer)
        resolve()
      })
    })
  }

  private resolveOpenTurn(result: TurnResult): void {
    const pending = this.turn
    if (!pending) return
    this.turn = null
    window.clearTimeout(pending.timer)
    pending.resolve(result)
  }

  private failOpenTurn(error: Error): void {
    const pending = this.turn
    if (!pending) return
    this.turn = null
    window.clearTimeout(pending.timer)
    pending.reject(error)
  }

  private startPing(): void {
    this.clearPing()
    this.pingTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            schema_version: '1.0',
            event_id: crypto.randomUUID(),
            type: 'ping',
          }),
        )
      }
    }, PING_INTERVAL_MS)
  }

  private clearPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return
    this.state = next
    this.emitToSubscribers('onStateChange', next)
  }
}

function tokenSecondsRemaining(token: string): number {
  try {
    const payload = token.split('.')[1]
    if (!payload) return 300
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(normalized)) as { exp?: number }
    return claims.exp ? Math.max(1, claims.exp - Date.now() / 1000) : 300
  } catch {
    return 300
  }
}

function normalizeParticipantIdentity(identity: string): string {
  const parts = identity.split(':')
  if ((parts[0] === 'agent' || parts[0] === 'writer') && parts[1]) return parts[1]
  return identity
}

function humanizeIdentity(identity: string): string {
  if (identity.toLowerCase() === 'director') return 'Director'
  return identity
    .replace(/^char_/, '')
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Server frame layout: 4-byte big-endian header length, JSON header, PCM body.
 * Mirrors `WebSocketAudioPublisher.publish` in app/api/live.py.
 */
export function decodeAudioFrame(buffer: ArrayBuffer): AudioFrame | null {
  if (buffer.byteLength < 4) return null
  const view = new DataView(buffer)
  const headerLength = view.getUint32(0, false)
  if (headerLength <= 0 || 4 + headerLength > buffer.byteLength) return null

  let header: Record<string, unknown>
  try {
    header = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)),
    ) as Record<string, unknown>
  } catch {
    return null
  }

  return {
    turnId: String(header.turn_id ?? ''),
    streamId: String(header.stream_id ?? ''),
    agentId: header.agent_id ? String(header.agent_id) : null,
    sequence: Number(header.sequence ?? 0),
    codec: String(header.codec ?? ''),
    sampleRateHz: Number(header.sample_rate_hz ?? 0),
    channels: Number(header.channels ?? 1),
    presentationTimeMs: Number(header.presentation_time_ms ?? 0),
    isFinal: Boolean(header.is_final),
    data: buffer.slice(4 + headerLength),
  }
}
