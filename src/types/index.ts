/** UI flow steps */
export type AppStep = 'landing' | 'upload' | 'characters' | 'call' | 'final-story'

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
  /** Anonymous story-scoped authority returned after extraction. */
  capabilityToken?: string
  writerId?: string
  bootstrapRequestId?: string
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
  voice_id?: string
  voice_name?: string
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
  /** False when the cast shares voices. Surfaced so the writer is told
   *  before they demo, rather than discovering it on stage. */
  voicesDistinct?: boolean
  selectedCastIds?: string[]
  participants?: SessionParticipant[]
}

export interface SessionParticipant {
  id: string
  name: string
  type: 'director' | 'character'
  characterId?: string
  voiceId?: string
  imageUrl?: string
  focused?: boolean
}

export interface FinalStoryDraft {
  title: string
  narrative: string
  change_summary: string[]
  unresolved_questions: string[]
}

export interface StoryArtifact {
  artifact_id: string
  draft: FinalStoryDraft
  download_url: string
}

export interface FinalizationProposal {
  proposal_id: string
  summary: string
  rationale: string
}

export interface Voice {
  voiceId: string
  name: string
  category?: string
  description?: string
  previewUrl?: string
  labels?: Record<string, string>
}

export interface CharacterAssetUpdate {
  imageUrl?: string
  voiceId?: string
  voiceName?: string
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
  demographics?: {
    age?: number | null
    age_range?: string | null
    gender?: string | null
  } | null
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
    accent_or_dialect?: string | null
    sample_quotes?: Array<{ text?: string } | string>
  } | null
  secrets?: Array<{ summary?: string }>
  known_information?: unknown[]
  [key: string]: unknown
}

export interface StoryExtraction {
  schema_version: string
  extraction_id: string
  /** Story-scoped asset authorization, when supplied by the backend. */
  capability_token?: string
  story_capability_token?: string
  writer_id?: string
  request_id?: string
  capability_token_expires_in_seconds?: number
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

export interface StorySummary {
  id: string
  extraction_id: string
  title: string
  logline: string
  short_synopsis: string
  character_count: number
  updated_at: string
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
  participants?: SessionParticipant[]
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
  /** False when two or more characters share a voice — usually an unset
   *  VOICE_POOL on the server. The room works; it just sounds wrong. */
  voices_distinct?: boolean
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
      participant_ids: string[]
      max_agent_turns: number
    }
  | { schema_version: '1.0'; event_id: string; type: 'discussion.stop' }
  | { schema_version: '1.0'; event_id: string; type: 'session.ticket.refresh' }
  | { schema_version: '1.0'; event_id: string; type: 'story.finalization.request' }
  | {
      schema_version: '1.0'
      event_id: string
      type: 'story.finalization.respond'
      proposal_id: string
      decision: 'confirm' | 'revise' | 'reject'
      revision_notes?: string
    }
  | { schema_version: '1.0'; event_id: string; type: 'session.leave' }
  | {
      schema_version: '1.0'
      event_id: string
      type: 'writer.audio.start'
      turn_id: string
      stream_id: string
      audio_format: string
      sample_rate_hz: number
    }
  | {
      schema_version: '1.0'
      event_id: string
      type: 'writer.audio.stop'
      stream_id: string
    }

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
