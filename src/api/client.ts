import type {
  Character,
  ChatTurnResult,
  ExtractRequestBody,
  LiveClientEvent,
  LiveServerEvent,
  LiveSession,
  StoryContext,
  StoryExtraction,
  StorySource,
  StudioStartSessionResponse,
} from '../types'
import { buildStubExtraction } from '../lib/buildStubExtraction'
import {
  mapExtractionToCharacters,
  summaryFromExtraction,
} from '../lib/mapExtraction'

/**
 * Base URL for FastAPI.
 * - Dev: empty → Vite proxy `/api` → localhost:8000
 * - Prod: VITE_API_BASE_URL
 */
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.replace(/\/$/, '') ?? ''

const WRITER_ID =
  (import.meta.env.VITE_WRITER_ID as string | undefined)?.trim() || 'ui-writer'

const DEFAULT_VOICE_ID =
  (import.meta.env.VITE_DEFAULT_VOICE_ID as string | undefined)?.trim() ||
  undefined

export type BackendMode = 'live' | 'offline'

export interface IngestStoryResult {
  story: StoryContext
  characters: Character[]
  summary?: string
  extraction: StoryExtraction
  mode: BackendMode
}

export interface StartCallResult {
  session: LiveSession
  character: Character
  greeting?: string
}

function url(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (API_BASE) return `${API_BASE}${p}`
  return `/api${p}`
}

function wsUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (API_BASE) {
    const base = API_BASE.replace(/^http/, 'ws')
    return `${base}${p}`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api${p}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init?.headers || {}),
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (body?.error?.message) detail = body.error.message
      else if (body?.message) detail = body.message
      else detail = JSON.stringify(body)
    } catch {
      /* ignore */
    }
    throw new Error(`API ${res.status}: ${detail}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Soft probe — does not throw */
export async function checkHealth(): Promise<{
  healthy: boolean
  ready: boolean
}> {
  let healthy = false
  let ready = false
  try {
    const h = await request<{ status: string }>('/health')
    healthy = h.status === 'healthy'
  } catch {
    healthy = false
  }
  try {
    const r = await request<{ status: string }>('/ready')
    ready = r.status === 'ready'
  } catch {
    ready = false
  }
  return { healthy, ready }
}

/**
 * Ingest story via actor-context extraction.
 *   POST /actor-context/extract
 * Falls back to client stub if the API is down / missing keys.
 */
export async function ingestStory(input: {
  title: string
  text: string
  source: StorySource
  fileName?: string
}): Promise<IngestStoryResult> {
  const title = input.title.trim() || 'Untitled Story'

  try {
    const body: ExtractRequestBody = {
      text: input.text,
      title,
      enable_web_search: true,
      enable_gap_fill: true,
    }
    const extraction = await request<StoryExtraction>('/actor-context/extract', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const characters = mapExtractionToCharacters(extraction)
    const storyId =
      extraction.story?.id ||
      extraction.extraction_id ||
      `story-${crypto.randomUUID()}`

    return {
      mode: 'live',
      extraction,
      characters,
      summary: summaryFromExtraction(
        extraction,
        `Extracted ${characters.length} character${characters.length === 1 ? '' : 's'}`,
      ),
      story: {
        id: storyId,
        title: (extraction.story?.title as string) || title,
        text: input.text,
        source: input.source,
        fileName: input.fileName,
        createdAt: new Date().toISOString(),
        extractionVersion: extraction.extraction_id,
        logline: extraction.story?.logline || undefined,
        shortSynopsis: extraction.story?.short_synopsis || undefined,
        extraction,
        ingestMode: 'live',
      },
    }
  } catch (err) {
    console.warn('[api] POST /actor-context/extract failed, using stub:', err)
    const extraction = buildStubExtraction({
      title,
      text: input.text,
      source: input.source,
    })
    const characters = mapExtractionToCharacters(extraction)
    return {
      mode: 'offline',
      extraction,
      characters,
      summary:
        err instanceof Error
          ? `Offline cast · ${err.message}`
          : 'Offline cast · extraction API unavailable',
      story: {
        id: extraction.story.id || `local-${crypto.randomUUID()}`,
        title,
        text: input.text,
        source: input.source,
        fileName: input.fileName,
        createdAt: new Date().toISOString(),
        extractionVersion: extraction.extraction_id,
        logline: extraction.story.logline || undefined,
        shortSynopsis: extraction.story.short_synopsis || undefined,
        extraction,
        ingestMode: 'offline',
      },
    }
  }
}

/**
 * Start a live room for selected character(s).
 *   POST /actor-context/bootstrap
 *
 * The backend never exposed /v1/studio/start-session. This endpoint takes the
 * same body and returns room_id, session_id and live_token, which is exactly
 * what the WebSocket needs. voice_ids may be omitted — the server fills them
 * from DEFAULT_CHARACTER_VOICE_ID.
 */
export async function startCall(input: {
  story: StoryContext
  character: Character
  castIds?: string[]
}): Promise<StartCallResult> {
  const extraction = input.story.extraction
  if (!extraction) {
    return offlineCall(input.character, 'No extraction payload on story')
  }

  const characterIds = input.castIds?.length
    ? input.castIds
    : [input.character.id]

  // Prefer single-character cast for focused interview UX
  const selectedIds = characterIds.includes(input.character.id)
    ? [input.character.id]
    : [input.character.id]

  const voiceIds: Record<string, string> = {}
  if (DEFAULT_VOICE_ID) {
    for (const id of selectedIds) voiceIds[id] = DEFAULT_VOICE_ID
  }

  try {
    const res = await request<StudioStartSessionResponse>(
      '/actor-context/bootstrap',
      {
        method: 'POST',
        body: JSON.stringify({
          extraction,
          character_ids: selectedIds,
          writer_id: WRITER_ID,
          request_id: crypto.randomUUID(),
          ...(Object.keys(voiceIds).length ? { voice_ids: voiceIds } : {}),
        }),
      },
    )

    return {
      character: input.character,
      greeting: defaultGreeting(input.character.name),
      session: {
        roomId: String(res.room_id),
        sessionId: String(res.session_id),
        liveToken: res.live_token,
        writerId: res.writer_id || WRITER_ID,
        mode: 'live',
      },
    }
  } catch (err) {
    console.warn('[api] POST /actor-context/bootstrap failed:', err)
    return offlineCall(
      input.character,
      err instanceof Error ? err.message : 'room bootstrap failed',
    )
  }
}

function offlineCall(character: Character, reason: string): StartCallResult {
  console.warn('[api] offline call:', reason)
  return {
    character,
    greeting: defaultGreeting(character.name),
    session: {
      roomId: `local-room-${crypto.randomUUID()}`,
      sessionId: `local-session-${crypto.randomUUID()}`,
      mode: 'offline',
    },
  }
}

/** Leave live room via WS session.leave when possible */
export async function endSession(session: LiveSession): Promise<void> {
  if (session.mode !== 'live' || !session.liveToken) return
  try {
    await leaveViaWebSocket(session)
  } catch (err) {
    console.warn('[api] end session WS leave:', err)
  }
}

/**
 * Text turn: live WS user.transcript.submit → agent.text.* events.
 * Offline demo replies if not live.
 */
export async function sendChatTurn(input: {
  session: LiveSession
  character: Character
  message: string
}): Promise<ChatTurnResult> {
  if (
    input.session.mode === 'live' &&
    input.session.liveToken &&
    !input.session.sessionId.startsWith('local-')
  ) {
    try {
      return await sendViaWebSocket({
        roomId: input.session.roomId,
        sessionId: input.session.sessionId,
        liveToken: input.session.liveToken,
        character: input.character,
        message: input.message,
      })
    } catch (err) {
      console.warn('[api] live WS turn failed, offline reply:', err)
    }
  }

  await delay(600 + Math.random() * 700)
  return {
    reply: offlineReply(input.message, input.character.name),
    character_name: input.character.name,
  }
}

function sendViaWebSocket(input: {
  roomId: string
  sessionId: string
  liveToken: string
  character: Character
  message: string
}): Promise<ChatTurnResult> {
  return new Promise((resolve, reject) => {
    const path =
      `/v1/rooms/${input.roomId}/sessions/${input.sessionId}/live` +
      `?token=${encodeURIComponent(input.liveToken)}`
    const socket = new WebSocket(wsUrl(path))
    let settled = false
    let textBuffer = ''
    let characterName = input.character.name
    let turnId: string | undefined
    let agentId: string | undefined
    let joined = false

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          socket.close()
        } catch {
          /* ignore */
        }
        reject(new Error('WebSocket chat timed out'))
      }
    }, 45_000)

    const finish = (result: ChatTurnResult) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      try {
        const leave: LiveClientEvent = {
          schema_version: '1.0',
          event_id: crypto.randomUUID(),
          type: 'session.leave',
        }
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(leave))
        }
        socket.close()
      } catch {
        /* ignore */
      }
      resolve(result)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      reject(error)
    }

    socket.onopen = () => {
      // Server auto-accepts after token check and emits session.joined.
      // Submit transcript once joined (or immediately if events race).
      const trySubmit = () => {
        const submit: LiveClientEvent = {
          schema_version: '1.0',
          event_id: crypto.randomUUID(),
          type: 'user.transcript.submit',
          turn_id: crypto.randomUUID(),
          stream_id: crypto.randomUUID(),
          text: input.message,
        }
        socket.send(JSON.stringify(submit))
      }

      // Brief delay so session.joined can arrive; also submit if already joined
      window.setTimeout(() => {
        if (settled) return
        if (!joined) {
          // Submit anyway — server may not require wait after accept
          trySubmit()
        } else {
          trySubmit()
        }
      }, 80)
    }

    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string') {
        // Binary agent.audio.chunk frames — ignore for text chat UI
        return
      }
      try {
        const msg = JSON.parse(ev.data) as LiveServerEvent
        const type = msg.type

        if (type === 'session.joined') {
          joined = true
          return
        }

        if (type === 'speaker.selected') {
          if (msg.speaker_id) {
            characterName = String(msg.speaker_id)
          }
          turnId = msg.turn_id || turnId
          return
        }

        if (type === 'agent.text.delta') {
          textBuffer += String(msg.text || '')
          if (msg.agent_id) {
            agentId = String(msg.agent_id)
            characterName = humanizeAgentId(String(msg.agent_id), input.character)
          }
          turnId = msg.turn_id || turnId
          return
        }

        if (
          type === 'agent.text.completed' ||
          type === 'agent.turn.completed'
        ) {
          const reply = textBuffer.trim()
          if (msg.agent_id) {
            agentId = String(msg.agent_id)
            characterName = humanizeAgentId(String(msg.agent_id), input.character)
          }
          if (!reply && type === 'agent.text.completed') {
            // Wait for turn.completed if text empty
            return
          }
          finish({
            reply:
              reply ||
              `(${characterName} finished speaking without text — check TTS-only path.)`,
            character_name: characterName,
            turn_id: msg.turn_id || turnId,
            agent_id: agentId,
          })
          return
        }

        if (type === 'agent.turn.failed' || type === 'error') {
          fail(
            new Error(
              String(msg.message || msg.code || 'Live room error'),
            ),
          )
          return
        }

        if (type === 'agent.turn.cancelled' || type === 'turn.interrupted') {
          if (textBuffer.trim()) {
            finish({
              reply: textBuffer.trim(),
              character_name: characterName,
              turn_id: msg.turn_id || turnId,
              agent_id: agentId,
            })
          }
        }
      } catch (e) {
        fail(e instanceof Error ? e : new Error('Bad WS message'))
      }
    }

    socket.onerror = () => {
      fail(new Error('WebSocket connection failed'))
    }

    socket.onclose = () => {
      if (!settled) {
        if (textBuffer.trim()) {
          finish({
            reply: textBuffer.trim(),
            character_name: characterName,
            turn_id: turnId,
            agent_id: agentId,
          })
        } else {
          fail(new Error('WebSocket closed before reply'))
        }
      }
    }
  })
}

function leaveViaWebSocket(session: LiveSession): Promise<void> {
  return new Promise((resolve) => {
    if (!session.liveToken) {
      resolve()
      return
    }
    const path =
      `/v1/rooms/${session.roomId}/sessions/${session.sessionId}/live` +
      `?token=${encodeURIComponent(session.liveToken)}`
    const socket = new WebSocket(wsUrl(path))
    const done = () => {
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      resolve()
    }
    const timer = window.setTimeout(done, 2000)
    socket.onopen = () => {
      const leave: LiveClientEvent = {
        schema_version: '1.0',
        event_id: crypto.randomUUID(),
        type: 'session.leave',
      }
      socket.send(JSON.stringify(leave))
      window.clearTimeout(timer)
      done()
    }
    socket.onerror = () => {
      window.clearTimeout(timer)
      done()
    }
  })
}

function humanizeAgentId(agentId: string, character: Character): string {
  if (agentId === character.id) return character.name
  if (agentId.toLowerCase() === 'director') return 'Director'
  // char_maya → Maya-ish fallback
  if (agentId.startsWith('char_')) {
    return agentId
      .replace(/^char_/, '')
      .split('_')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
  }
  return character.name
}

function defaultGreeting(name: string): string {
  return `…I'm ${name}. You wanted to talk? I'll stay in character — I only know what the story says I know.`
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function offlineReply(userMessage: string, name: string): string {
  const q = userMessage.toLowerCase()
  if (q.includes('who are you') || q.includes('name')) {
    return `I'm ${name}. That's who I am on the page — nothing more, nothing less.`
  }
  if (q.includes('feel') || q.includes('afraid') || q.includes('want')) {
    return `That sits heavy. From what you've written of me, I don't hand out easy answers. Which scene are you thinking of?`
  }
  if (q.includes('plot') || q.includes('inconsistent') || q.includes('hole')) {
    return `I only know what happened to me on the page. Point at the moment that feels false — I'll tell you whether it rings true.`
  }
  return `Hmm. "${userMessage.slice(0, 80)}${userMessage.length > 80 ? '…' : ''}" — stay in the world with me. Ask what I know, what I'd do, or what I'm hiding. (Offline demo — check /actor-context/extract and /actor-context/bootstrap.)`
}

