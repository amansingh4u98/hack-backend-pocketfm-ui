import type {
  Character,
  LiveSession,
  StoryArtifact,
  StoryContext,
} from '../types'

const STORAGE_KEY = 'off-the-page.workflow.v1'

export interface WorkflowState {
  story: StoryContext | null
  characters: Character[]
  summary?: string
  selected: Character | null
  selectedCharacters: Character[]
  session: LiveSession | null
  greeting?: string
  artifact: StoryArtifact | null
}

export const emptyWorkflowState: WorkflowState = {
  story: null,
  characters: [],
  selected: null,
  selectedCharacters: [],
  session: null,
  artifact: null,
}

export function loadWorkflowState(): WorkflowState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyWorkflowState
    const parsed = JSON.parse(raw) as Partial<WorkflowState>
    return {
      story: parsed.story ?? null,
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      summary: parsed.summary,
      selected: parsed.selected ?? null,
      selectedCharacters: Array.isArray(parsed.selectedCharacters)
        ? parsed.selectedCharacters
        : [],
      session: parsed.session ?? null,
      greeting: parsed.greeting,
      artifact: parsed.artifact ?? null,
    }
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return emptyWorkflowState
  }
}

export function saveWorkflowState(state: WorkflowState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    // A very large manuscript can exceed the browser's per-tab storage quota.
    // Routing must remain usable even when refresh restoration is unavailable.
    console.warn('[workflow] could not persist route state', error)
  }
}

export function clearWorkflowState(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}
