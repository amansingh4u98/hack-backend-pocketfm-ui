import type { Character, ExtractionCharacter, StoryExtraction } from '../types'

const PALETTE = [
  '#e8a45a',
  '#c97b84',
  '#7eb8a2',
  '#8b9dc9',
  '#c9a87e',
  '#a78bc9',
]

/**
 * Map backend extraction characters (or CharacterBrief-like objects)
 * into UI cast cards.
 */
export function mapExtractionCharacter(
  raw: ExtractionCharacter | Character | Record<string, unknown>,
  index = 0,
): Character {
  // Already a UI Character
  if (
    typeof raw === 'object' &&
    raw &&
    'name' in raw &&
    typeof (raw as Character).name === 'string' &&
    !('voice_and_dialogue' in raw) &&
    !('display_name' in raw)
  ) {
    const c = raw as Character
    return {
      ...c,
      avatar_color: c.avatar_color || PALETTE[index % PALETTE.length],
    }
  }

  // CharacterBrief (domain models)
  if (raw && typeof raw === 'object' && 'display_name' in raw) {
    const b = raw as {
      character_id?: string
      id?: string
      display_name: string
      aliases?: string[]
      persona?: string
      stance?: string
      voice_direction?: string
      as_of_scene?: number | null
    }
    return {
      id: b.character_id || b.id || `char-${index}`,
      name: b.display_name,
      aliases: b.aliases,
      description: b.persona,
      personality: b.stance || b.voice_direction,
      voice: b.voice_direction,
      knowledge_scope:
        b.as_of_scene != null ? `Knowledge as of scene ${b.as_of_scene}` : undefined,
      avatar_color: PALETTE[index % PALETTE.length],
    }
  }

  const e = raw as ExtractionCharacter
  const quotes = (e.voice_and_dialogue?.sample_quotes || [])
    .map((q) => (typeof q === 'string' ? q : q.text || ''))
    .filter(Boolean)

  return {
    id: e.id,
    name: e.name,
    aliases: e.aliases,
    role: e.role,
    importance: e.importance,
    description: e.description || e.personality?.summary || undefined,
    personality: e.personality?.summary || e.personality?.traits?.join(', '),
    motivation:
      e.motivation?.primary_motivation || e.motivation?.external_goal || undefined,
    voice:
      e.voice_and_dialogue?.summary ||
      e.voice_and_dialogue?.sentence_style ||
      undefined,
    sample_quotes: quotes.length ? quotes : undefined,
    secrets_count: e.secrets?.length,
    avatar_color: PALETTE[index % PALETTE.length],
  }
}

export function mapExtractionToCharacters(
  extraction: Pick<StoryExtraction, 'characters'> | { characters: unknown[] },
): Character[] {
  return (extraction.characters || []).map((c, i) =>
    mapExtractionCharacter(c as ExtractionCharacter, i),
  )
}

export function summaryFromExtraction(
  extraction: StoryExtraction,
  fallback?: string,
): string {
  const logline = extraction.story?.logline
  const synopsis = extraction.story?.short_synopsis
  if (logline) return String(logline)
  if (synopsis) return String(synopsis)
  const n = extraction.characters?.length ?? 0
  return fallback || `Extraction ready · ${n} character${n === 1 ? '' : 's'}`
}
