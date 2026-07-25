import type {
  Character,
  ChatTurnResult,
  ExtractRequestBody,
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
import { LiveSessionClient } from '../lib/liveSession'
import type { AudioFrame, ConnectionState } from '../lib/liveSession'

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
  asOfScene?: number
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
          as_of_scene: input.asOfScene,
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

/**
 * One client per session, held open for the whole call.
 *
 * Keyed by sessionId so components can reach the socket for audio and
 * connection state without threading it through props.
 */
const liveClients = new Map<string, LiveSessionClient>()

export function getLiveClient(sessionId: string): LiveSessionClient | undefined {
  return liveClients.get(sessionId)
}

export interface LiveSessionHandlers {
  onAudio?: (frame: AudioFrame) => void
  onStateChange?: (state: ConnectionState) => void
  onTextDelta?: (text: string, agentId?: string) => void
}

/** Open (or reuse) the persistent socket for a live session. */
export async function openLiveSession(
  session: LiveSession,
  handlers: LiveSessionHandlers = {},
): Promise<LiveSessionClient | null> {
  if (
    session.mode !== 'live' ||
    !session.liveToken ||
    session.sessionId.startsWith('local-')
  ) {
    return null
  }

  const existing = liveClients.get(session.sessionId)
  if (existing) return existing

  const client = new LiveSessionClient(
    {
      apiBase: API_BASE,
      roomId: session.roomId,
      sessionId: session.sessionId,
      token: session.liveToken,
    },
    handlers,
  )
  liveClients.set(session.sessionId, client)
  try {
    await client.connect()
  } catch (err) {
    liveClients.delete(session.sessionId)
    throw err
  }
  return client
}

/** Leave live room via WS session.leave when possible */
export async function endSession(session: LiveSession): Promise<void> {
  const client = liveClients.get(session.sessionId)
  if (client) {
    liveClients.delete(session.sessionId)
    try {
      client.close()
    } catch (err) {
      console.warn('[api] end session close:', err)
    }
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
  try {
    const client = await openLiveSession(input.session)
    if (client) {
      const result = await client.sendText(input.message)
      return {
        reply:
          result.reply ||
          `(${input.character.name} finished speaking without text — check the TTS-only path.)`,
        character_name: result.agentId
          ? humanizeAgentId(result.agentId, input.character)
          : input.character.name,
        turn_id: result.turnId,
        agent_id: result.agentId,
      }
    }
  } catch (err) {
    console.warn('[api] live turn failed, offline reply:', err)
  }

  await delay(600 + Math.random() * 700)
  return {
    reply: offlineReply(input.message, input.character.name),
    character_name: input.character.name,
  }
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

