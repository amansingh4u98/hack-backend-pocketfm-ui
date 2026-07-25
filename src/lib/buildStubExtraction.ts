import type { StoryExtraction, StorySource } from '../types'
import { extractCharactersLocally } from './parseStory'

/**
 * Client-side stub approximating STORY_EXTRACTION_SPEC when
 * POST /actor-context/extract is unavailable (offline demo mode).
 */
export function buildStubExtraction(input: {
  title: string
  text: string
  source: StorySource
  storyId?: string
}): StoryExtraction {
  const locals = extractCharactersLocally(input.text)
  const extractionId = `ext_local_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  const storyId = input.storyId || `story_local_${crypto.randomUUID().slice(0, 8)}`

  const words = input.text.trim().split(/\s+/).filter(Boolean)
  const short =
    input.text.trim().slice(0, 280) + (input.text.trim().length > 280 ? '…' : '')

  return {
    schema_version: '1.0.0',
    extraction_id: extractionId,
    story: {
      id: storyId,
      title: input.title,
      author: null,
      language: 'en',
      source_type: input.source,
      completion_status: 'partial',
      logline: short || null,
      short_synopsis: short || null,
      full_synopsis: null,
      genres: [],
      subgenres: [],
      tone: [],
      themes: [],
      narrative: {
        point_of_view: null,
        tense: null,
        structure: 'other',
        narrator_character_id: null,
        style_notes: [],
        evidence: [],
      },
      setting: {
        summary: null,
        time_period: null,
        locations: [],
        world_rules: [],
        organizations: [],
        important_objects: [],
      },
      plot: {
        central_conflict: null,
        beginning: null,
        middle: null,
        climax: null,
        ending: null,
        major_plot_points: [],
        subplots: [],
        unresolved_questions: [],
      },
      story_facts: [],
      continuity_issues: [],
      evidence: [],
    },
    characters: locals.map((c) => ({
      id: c.id,
      name: c.name,
      aliases: [c.name.split(/\s+/)[0]].filter(Boolean),
      role: c.role === 'Likely lead' || c.role === 'Lead' ? 'protagonist' : 'supporting',
      importance: c.role === 'Likely lead' || c.role === 'Lead' ? 'primary' : 'secondary',
      description: c.description || null,
      personality: {
        summary: c.description || null,
        traits: [],
      },
      motivation: {
        primary_motivation: null,
        external_goal: null,
      },
      voice_and_dialogue: {
        summary: null,
        sentence_style: null,
        sample_quotes: [],
      },
      secrets: [],
      known_information: [],
    })),
    extraction_metadata: {
      model: 'client-stub/local-heuristic',
      pipeline_version: 'ui-stub-1.0.0',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      source_character_count: input.text.length,
      warnings: [
        'Client stub extraction — replace with external extractor or backend-provided cast.',
      ],
      quality: {
        story_coverage: 0,
        character_coverage: locals.length ? 0.4 : 0,
        evidence_coverage: 0,
        consistency_score: 0,
      },
      word_count: words.length,
    },
  }
}
