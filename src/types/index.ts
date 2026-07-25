/** UI flow steps */
export type AppStep = 'landing' | 'upload' | 'characters' | 'call'

export type StorySource = 'paste' | 'pdf' | 'doc' | 'txt'

export interface StoryContext {
  id: string
  title: string
  text: string
  source: StorySource
  fileName?: string
  createdAt: string
  extractionVersion?: string
  logline?: string
  shortSynopsis?: string
  /** Full backend StoryExtraction — needed for room bootstrap */
  extraction?: StoryExtraction
  ingestMode?: 'live' | 'offline'
}

/** UI-facing cast card (mapped from extraction / CharacterBrief / roster) */
export interface Character {
  id: string
  name: string
  aliases?: string[]
  role?: string
  importance?: string
  description?: string
  personality?: string
  motivation?: string
  voice?: string
  knowledge_scope?: string
  avatar_color?: string
  image_url?: string
  sample_quotes?: string[]
  secrets_count?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'character' | 'system'
  content: string
  timestamp: string
  characterName?: string
}

export interface LiveSession {
  roomId: string
  sessionId: string
  /** JWT for WS /v1/rooms/{room}/sessions/{session}/live?token= */
  liveToken?: string
  writerId?: string
  mode: 'live' | 'offline'
}

// ---------------------------------------------------------------------------
// Backend contracts (actor-context + studio + live WS)
// ---------------------------------------------------------------------------

/** Subset of docs/STORY_EXTRACTION_SPEC.md we consume in the UI */
export interface ExtractionCharacter {
  id: string
  name: string
  aliases?: string[]
  role?: string
  importance?: string
  description?: string | null
  personality?: {
    summary?: string | null
    traits?: string[]
  } | null
  motivation?: {
    primary_motivation?: string | null
    external_goal?: string | null
  } | null
  voice_and_dialogue?: {
    summary?: string | null
    sentence_style?: string | null
    sample_quotes?: Array<{ text?: string } | string>
  } | null
  secrets?: Array<{ summary?: string }>
  known_information?: unknown[]
  [key: string]: unknown
}

export interface StoryExtraction {
  schema_version: string
  extraction_id: string
  story: {
    id?: string
    title?: string
    logline?: string | null
    short_synopsis?: string | null
    source_type?: string
    [key: string]: unknown
  }
  characters: ExtractionCharacter[]
  extraction_metadata?: Record<string, unknown>
}

export interface ExtractRequestBody {
  text: string
  title?: string
  story_id?: string
  author?: string
  enable_web_search?: boolean
  enable_gap_fill?: boolean
}

export interface StudioStartSessionRequest {
  extraction: StoryExtraction
  character_ids: string[]
  writer_id?: string
  request_id?: string
  voice_ids?: Record<string, string>
}

export interface StudioStartSessionResponse {
  extraction_id: string
  story_id: string
  room_id: string
  session_id: string
  character_ids: string[]
  live_token: string
  created: boolean
  writer_id: string
}

export interface ChatTurnResult {
  reply: string
  character_name?: string
  video_url?: string | null
  audio_url?: string | null
  turn_id?: string
  agent_id?: string
}

/** Live WS client control events (protocol v1.0) */
export type LiveClientEvent =
  | { schema_version: '1.0'; event_id: string; type: 'ping' }
  | {
      schema_version: '1.0'
      event_id: string
      type: 'user.transcript.submit'
      turn_id: string
      stream_id: string
      text: string
    }
  | {
      schema_version: '1.0'
      event_id: string
      type: 'turn.interrupt'
      turn_id: string
    }
  | {
      schema_version: '1.0'
      event_id: string
      type: 'discussion.start'
      character_ids: string[]
      max_agent_turns: number
    }
  | { schema_version: '1.0'; event_id: string; type: 'discussion.stop' }
  | { schema_version: '1.0'; event_id: string; type: 'session.leave' }

/** Server → client JSON events (partial; only fields we use) */
export interface LiveServerEvent {
  schema_version?: string
  type: string
  event_id?: string
  room_id?: string
  session_id?: string
  turn_id?: string
  stream_id?: string
  agent_id?: string
  speaker_id?: string
  text?: string
  code?: string
  message?: string
  [key: string]: unknown
}
