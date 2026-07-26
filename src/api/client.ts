import type {
  Character,
  ChatTurnResult,
  ExtractRequestBody,
  LiveSession,
  StoryContext,
  StoryExtraction,
  StorySource,
  StudioStartSessionResponse,
  SessionParticipant,
  FinalStoryDraft,
  StoryArtifact,
  StorySummary,
  Voice,
} from '../types'
import { buildStubExtraction } from '../lib/buildStubExtraction'
import {
  mapExtractionToCharacters,
  summaryFromExtraction,
} from '../lib/mapExtraction'
import { LiveSessionClient } from '../lib/liveSession'

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

const OFFLINE_MODE =
  (import.meta.env.VITE_OFFLINE_MODE as string | undefined)?.trim().toLowerCase() ===
  'true'

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

function storyHeaders(story: StoryContext): HeadersInit | undefined {
  return story.capabilityToken
    ? { 'X-Story-Capability-Token': story.capabilityToken }
    : undefined
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

export async function listStories(): Promise<StorySummary[]> {
  const response = await request<{ stories: StorySummary[] }>('/v1/stories')
  return response.stories
}

export async function getStory(storyId: string): Promise<IngestStoryResult> {
  const response = await request<{
    extraction: StoryExtraction
    writer_id: string
    request_id: string
    capability_token: string
    voice_assignments: Record<string, { voice_id: string; name?: string | null }>
  }>(`/v1/stories/${encodeURIComponent(storyId)}`)
  const extraction = response.extraction
  const characters = mapExtractionToCharacters(extraction).map((character) => {
    const assignment = response.voice_assignments[character.id]
    return assignment
      ? {
          ...character,
          voice_id: assignment.voice_id,
          voice_name: assignment.name || 'Auto-assigned voice',
        }
      : character
  })
  const sourceType = extraction.story.source_type
  const source: StorySource =
    sourceType === 'pdf'
      ? 'pdf'
      : sourceType === 'doc' || sourceType === 'docx'
        ? 'doc'
        : 'txt'
  const fullSynopsis =
    typeof extraction.story.full_synopsis === 'string'
      ? extraction.story.full_synopsis
      : ''
  const story: StoryContext = {
    id: extraction.story.id || storyId,
    title: extraction.story.title || 'Untitled Story',
    text: fullSynopsis,
    source,
    createdAt: new Date().toISOString(),
    extractionVersion: extraction.extraction_id,
    capabilityToken: response.capability_token,
    writerId: response.writer_id,
    bootstrapRequestId: response.request_id,
    logline: extraction.story.logline || undefined,
    shortSynopsis: extraction.story.short_synopsis || undefined,
    directorVoiceId: response.voice_assignments.director?.voice_id,
    directorVoiceName: response.voice_assignments.director?.name || undefined,
    extraction,
    ingestMode: 'live',
  }
  const cast = await autoAssignCharacterVoices(story, characters, extraction)
  return {
    mode: 'live',
    extraction,
    characters: cast,
    summary: summaryFromExtraction(extraction),
    story,
  }
}

/**
 * Ingest story via actor-context extraction.
 *   POST /actor-context/extract
 * Local extraction is available only when VITE_OFFLINE_MODE=true.
 */
export async function ingestStory(input: {
  title: string
  text: string
  source: StorySource
  fileName?: string
}): Promise<IngestStoryResult> {
  const title = input.title.trim() || 'Untitled Story'
  const requestedStoryId = `story_${crypto.randomUUID()}`

  try {
    const body: ExtractRequestBody = {
      text: input.text,
      title,
      story_id: requestedStoryId,
      enable_web_search: true,
      enable_gap_fill: true,
    }
    const extraction = await request<StoryExtraction>('/actor-context/extract', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const extractedCharacters = mapExtractionToCharacters(extraction)
    const storyId =
      extraction.story?.id ||
      extraction.extraction_id ||
      requestedStoryId
    const capability =
      extraction.capability_token && extraction.writer_id && extraction.request_id
        ? {
            capability_token: extraction.capability_token,
            writer_id: extraction.writer_id,
            request_id: extraction.request_id,
          }
        : await request<{
            writer_id: string
            request_id: string
            capability_token: string
          }>('/actor-context/anonymous-capability', {
            method: 'POST',
            body: JSON.stringify({ story_id: storyId }),
          })

    const story: StoryContext = {
      id: storyId,
      title: (extraction.story?.title as string) || title,
      text: input.text,
      source: input.source,
      fileName: input.fileName,
      createdAt: new Date().toISOString(),
      extractionVersion: extraction.extraction_id,
      capabilityToken: capability.capability_token,
      writerId: capability.writer_id,
      bootstrapRequestId: capability.request_id,
      logline: extraction.story?.logline || undefined,
      shortSynopsis: extraction.story?.short_synopsis || undefined,
      extraction,
      ingestMode: 'live',
    }
    const characters = await autoAssignCharacterVoices(
      story,
      extractedCharacters,
      extraction,
    )
    return {
      mode: 'live',
      extraction,
      characters,
      summary: summaryFromExtraction(
        extraction,
        `Extracted ${characters.length} character${characters.length === 1 ? '' : 's'}`,
      ),
      story,
    }
  } catch (err) {
    if (!OFFLINE_MODE) throw err
    console.warn('[api] explicit offline mode, using local extraction:', err)
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
  cast: Character[]
  participants: SessionParticipant[]
  focusId?: string
  asOfScene?: number
}): Promise<StartCallResult> {
  const extraction = input.story.extraction
  if (!extraction) {
    if (OFFLINE_MODE) {
      return offlineCall(input.character, input.cast, input.participants)
    }
    throw new Error('Cannot bootstrap a session without an extraction payload')
  }

  const selectedIds = input.cast.map((character) => character.id)

  const voiceIds: Record<string, string> = {}
  for (const member of input.cast) {
    if (member.voice_id) voiceIds[member.id] = member.voice_id
    else if (DEFAULT_VOICE_ID) voiceIds[member.id] = DEFAULT_VOICE_ID
  }

  try {
    const res = await request<StudioStartSessionResponse>(
      '/actor-context/bootstrap',
      {
        method: 'POST',
        body: JSON.stringify({
          extraction,
          character_ids: selectedIds,
          focus_character_id: input.focusId || 'director',
          writer_id: input.story.writerId || WRITER_ID,
          // Every call-room needs a fresh idempotency key. Reusing the story
          // extraction request ID recreates the same LiveKit identities and
          // disconnects participants with DuplicateIdentity.
          request_id: crypto.randomUUID(),
          capability_token: input.story.capabilityToken,
          as_of_scene: input.asOfScene,
          ...(Object.keys(voiceIds).length ? { voice_ids: voiceIds } : {}),
        }),
        headers: storyHeaders(input.story),
      },
    )

    const focusedParticipant: Character =
      input.focusId === 'director'
        ? {
            id: 'director',
            name: 'Director',
            role: 'Writers’ room facilitator',
            description:
              'Facilitates the room and helps the cast and writer develop the story.',
            voice_id: input.story.directorVoiceId,
            voice_name: input.story.directorVoiceName || 'Server default voice',
            avatar_color: '#047857',
          }
        : input.character

    return {
      character: focusedParticipant,
      greeting:
        input.focusId === 'director'
          ? undefined
          : defaultGreeting(input.character.name),
      session: {
        roomId: String(res.room_id),
        sessionId: String(res.session_id),
        liveToken: res.live_token,
        writerId: res.writer_id || WRITER_ID,
        mode: 'live',
        voicesDistinct: res.voices_distinct !== false,
        selectedCastIds: selectedIds,
        participants: input.participants,
      },
    }
  } catch (err) {
    if (!OFFLINE_MODE) throw err
    console.warn('[api] explicit offline session:', err)
    return offlineCall(input.character, input.cast, input.participants)
  }
}

function offlineCall(
  character: Character,
  cast: Character[],
  participants: SessionParticipant[],
): StartCallResult {
  return {
    character,
    greeting: defaultGreeting(character.name),
    session: {
      roomId: `local-room-${crypto.randomUUID()}`,
      sessionId: `local-session-${crypto.randomUUID()}`,
      mode: 'offline',
      selectedCastIds: cast.map((member) => member.id),
      participants,
    },
  }
}

export async function listVoices(
  search = '',
  story?: StoryContext,
): Promise<Voice[]> {
  const query = new URLSearchParams()
  if (search.trim()) query.set('search', search.trim())
  const result = await request<
    | unknown[]
    | { voices?: unknown[]; items?: unknown[]; data?: unknown[] }
  >(`/v1/voices${query.size ? `?${query}` : ''}`, {
    headers: story ? storyHeaders(story) : undefined,
  })
  const rows = Array.isArray(result)
    ? result
    : result.voices || result.items || result.data || []
  return rows.map(normalizeVoice).filter((voice): voice is Voice => Boolean(voice))
}

function normalizeVoice(raw: unknown): Voice | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.voice && typeof row.voice === 'object') return normalizeVoice(row.voice)
  const voiceId = String(row.voice_id || row.voiceId || row.id || '')
  if (!voiceId) return null
  const labels =
    row.labels && typeof row.labels === 'object'
      ? (row.labels as Record<string, string>)
      : undefined
  return {
    voiceId,
    name: String(row.name || row.display_name || 'Unnamed voice'),
    category: row.category ? String(row.category) : undefined,
    description: row.description ? String(row.description) : undefined,
    previewUrl: row.preview_url
      ? String(row.preview_url)
      : row.previewUrl
        ? String(row.previewUrl)
        : undefined,
    labels,
  }
}

export async function assignCharacterVoice(
  story: StoryContext,
  characterId: string,
  voiceId: string,
  voice?: Voice,
): Promise<void> {
  await request(`/v1/stories/${encodeURIComponent(story.id)}/characters/${encodeURIComponent(characterId)}/voice`, {
    method: 'PUT',
    headers: storyHeaders(story),
    body: JSON.stringify({
      voice_id: voiceId,
      name: voice?.name,
      description: voice?.description,
      preview_url: voice?.previewUrl,
      labels: voice?.labels,
    }),
  })
}

async function autoAssignCharacterVoices(
  story: StoryContext,
  characters: Character[],
  extraction: StoryExtraction,
): Promise<Character[]> {
  if (characters.every((character) => Boolean(character.voice_id))) {
    return characters
  }
  let voices: Voice[]
  try {
    voices = await listVoices('', story)
  } catch (error) {
    console.warn('[voices] automatic catalog loading failed', error)
    return characters
  }
  const available = voices.filter(
    (voice) =>
      normalizeVoiceLabel(voice.category) !== 'cloned' &&
      voice.voiceId !== story.directorVoiceId,
  )
  if (!available.length) return characters
  const assigned: Character[] = []

  for (const character of characters) {
    if (character.voice_id) {
      assigned.push(character)
      const existingIndex = available.findIndex(
        (voice) => voice.voiceId === character.voice_id,
      )
      if (existingIndex >= 0) available.splice(existingIndex, 1)
      continue
    }
    const extracted = extraction.characters.find((item) => item.id === character.id)
    const gender = normalizeGender(extracted?.demographics?.gender)
    const age = characterAgeBand(
      extracted?.demographics?.age,
      extracted?.demographics?.age_range,
    )
    const accent = normalizeVoiceLabel(
      extracted?.voice_and_dialogue?.accent_or_dialect,
    )
    const language = normalizeVoiceLabel(extraction.story.language)
    const genderMatches = gender
      ? available.filter(
          (voice) => normalizeGender(voice.labels?.gender) === gender,
        )
      : []
    const candidates = genderMatches.length ? genderMatches : available
    if (!candidates.length) {
      assigned.push(character)
      continue
    }
    const ranked = candidates
      .map((voice) => ({
        voice,
        score:
          (gender &&
          normalizeGender(voice.labels?.gender) === gender
            ? 8
            : 0) +
          (age && normalizeAgeLabel(voice.labels?.age) === age ? 4 : 0) +
          (accent &&
          normalizeVoiceLabel(voice.labels?.accent).includes(accent)
            ? 2
            : 0) +
          (language &&
          normalizeVoiceLabel(voice.labels?.language) === language
            ? 1
            : 0),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.voice.voiceId.localeCompare(right.voice.voiceId),
      )
    const bestScore = ranked[0]?.score ?? 0
    const best = ranked
      .filter((item) => item.score === bestScore)
      .slice(0, 3)
    const chosen =
      best[stableIndex(`${story.id}:${character.id}`, best.length)]?.voice
    if (!chosen) {
      assigned.push(character)
      continue
    }
    try {
      await assignCharacterVoice(
        story,
        character.id,
        chosen.voiceId,
        chosen,
      )
      assigned.push({
        ...character,
        voice_id: chosen.voiceId,
        voice_name: chosen.name,
      })
      const chosenIndex = available.findIndex(
        (voice) => voice.voiceId === chosen.voiceId,
      )
      if (chosenIndex >= 0) available.splice(chosenIndex, 1)
    } catch (error) {
      console.warn(
        `[voices] could not assign a default voice to ${character.id}`,
        error,
      )
      assigned.push(character)
    }
  }
  return assigned
}

function normalizeVoiceLabel(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function normalizeGender(value: unknown): string {
  const gender = normalizeVoiceLabel(value)
  if (gender === 'woman' || gender === 'girl') return 'female'
  if (gender === 'man' || gender === 'boy') return 'male'
  return gender
}

function normalizeAgeLabel(value: unknown): string {
  const age = normalizeVoiceLabel(value)
  if (age === 'young_adult') return 'young'
  if (age === 'middle_age') return 'middle_aged'
  if (age === 'elderly' || age === 'senior') return 'old'
  return age
}

function characterAgeBand(
  value: number | null | undefined,
  range: string | null | undefined,
): string {
  if (typeof value === 'number') {
    if (value < 30) return 'young'
    if (value <= 50) return 'middle_aged'
    return 'old'
  }
  const normalized = normalizeVoiceLabel(range)
  if (normalized.includes('young') || normalized.includes('teen')) return 'young'
  if (normalized.includes('middle')) return 'middle_aged'
  if (
    normalized.includes('old') ||
    normalized.includes('elder') ||
    normalized.includes('senior')
  ) {
    return 'old'
  }
  return ''
}

function stableIndex(seed: string, size: number): number {
  if (size <= 1) return 0
  let hash = 0
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash % size
}

export async function removeCharacterVoice(
  story: StoryContext,
  characterId: string,
): Promise<void> {
  await request(`/v1/stories/${encodeURIComponent(story.id)}/characters/${encodeURIComponent(characterId)}/voice`, {
    method: 'DELETE',
    headers: storyHeaders(story),
  })
}

export async function uploadCharacterImage(
  story: StoryContext,
  characterId: string,
  file: File,
): Promise<string | undefined> {
  const form = new FormData()
  form.append('file', file)
  const result = await request<Record<string, unknown>>(
    `/v1/stories/${encodeURIComponent(story.id)}/characters/${encodeURIComponent(characterId)}/image`,
    { method: 'POST', headers: storyHeaders(story), body: form },
  )
  return String(result.image_url || result.url || '') || undefined
}

export async function removeCharacterImage(
  story: StoryContext,
  characterId: string,
): Promise<void> {
  await request(`/v1/stories/${encodeURIComponent(story.id)}/characters/${encodeURIComponent(characterId)}/image`, {
    method: 'DELETE',
    headers: storyHeaders(story),
  })
}

export async function cloneCharacterVoice(input: {
  story: StoryContext
  characterId: string
  name: string
  description: string
  consent: boolean
  files: File[]
}): Promise<Voice | null> {
  const form = new FormData()
  form.append('name', input.name)
  form.append('description', input.description)
  form.append('consent', String(input.consent))
  for (const file of input.files) form.append('files', file)
  const result = await request<unknown>(
    `/v1/stories/${encodeURIComponent(input.story.id)}/characters/${encodeURIComponent(input.characterId)}/voice-clone`,
    { method: 'POST', headers: storyHeaders(input.story), body: form },
  )
  return normalizeVoice(result)
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

/** Open (or reuse) the persistent socket for a live session. */
export async function openLiveSession(
  session: LiveSession,
): Promise<LiveSessionClient | null> {
  if (
    session.mode !== 'live' ||
    !session.liveToken ||
    session.sessionId.startsWith('local-')
  ) {
    return null
  }

  const existing = liveClients.get(session.sessionId)
  if (existing) {
    return existing
  }

  const client = new LiveSessionClient(
    {
      apiBase: API_BASE,
      roomId: session.roomId,
      sessionId: session.sessionId,
      token: session.liveToken,
    },
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
    session.liveToken = client.token
    liveClients.delete(session.sessionId)
    try {
      client.close()
    } catch (err) {
      console.warn('[api] end session close:', err)
    }
  }
}

interface ExportApiResponse {
  id?: string
  artifact_id?: string
  title?: string
  narrative?: string
  change_summary?: string[]
  unresolved_questions?: string[]
  draft?: FinalStoryDraft
  download_url: string
}

/** Synchronous HTTP fallback for servers that do not emit export events yet. */
export async function createStoryExport(
  session: LiveSession,
  title?: string,
): Promise<StoryArtifact> {
  const client = liveClients.get(session.sessionId)
  const token = client?.token || session.liveToken
  if (!token) throw new Error('A live session token is required to export')
  const result = await request<ExportApiResponse>(
    `/v1/rooms/${encodeURIComponent(session.roomId)}/sessions/${encodeURIComponent(session.sessionId)}/exports`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(title?.trim() ? { title: title.trim() } : {}),
    },
  )
  return {
    artifact_id: String(result.artifact_id || result.id || ''),
    download_url: result.download_url,
    draft: result.draft || {
      title: result.title || title || 'Final story',
      narrative: result.narrative || '',
      change_summary: result.change_summary || [],
      unresolved_questions: result.unresolved_questions || [],
    },
  }
}

/** Fetch the protected PDF with the room bearer token, then download its blob. */
export async function downloadStoryPdf(
  session: LiveSession,
  downloadUrl: string,
  fileName: string,
): Promise<void> {
  const client = liveClients.get(session.sessionId)
  const token = client?.token || session.liveToken
  if (!token) throw new Error('A live session token is required to download')
  const absoluteUrl = downloadUrl.startsWith('http') ? downloadUrl : url(downloadUrl)
  const response = await fetch(absoluteUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`PDF download failed (${response.status})`)
  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = `${fileName.replace(/[^a-z0-9_-]+/gi, '-') || 'story-draft'}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
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
    if (!OFFLINE_MODE) throw err
    console.warn('[api] explicit offline reply:', err)
  }

  if (!OFFLINE_MODE) {
    throw new Error('Live session is unavailable')
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
  return `Hmm. "${userMessage.slice(0, 80)}${userMessage.length > 80 ? '…' : ''}" — stay in the world with me. Ask what I know, what I'd do, or what I'm hiding.`
}

