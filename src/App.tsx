import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import type { StoryArtifact } from './types'
import { Landing } from './components/Landing'
import { StoryUpload } from './components/StoryUpload'
import { StoryLibrary } from './components/StoryLibrary'
import { CharacterSelect } from './components/CharacterSelect'
import { CallRoom } from './components/CallRoom'
import { FinalStory } from './components/FinalStory'
import {
  clearWorkflowState,
  emptyWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
  type WorkflowState,
} from './lib/workflowState'
import { getStory } from './api/client'

export default function App() {
  const [workflow, setWorkflow] = useState<WorkflowState>(loadWorkflowState)
  const location = useLocation()
  const navigate = useNavigate()
  const isLanding = location.pathname === '/'
  const isCall = location.pathname.includes('/rooms/')

  useEffect(() => {
    saveWorkflowState(workflow)
  }, [workflow])

  function clearAndNavigate(path: string) {
    clearWorkflowState()
    setWorkflow(emptyWorkflowState)
    navigate(path)
  }

  function backPath(): string {
    if (location.pathname === '/stories' || location.pathname === '/stories/new') {
      return '/'
    }
    if (location.pathname.endsWith('/final') && workflow.story) {
      return charactersPath(workflow.story.id)
    }
    return '/stories'
  }

  return (
    <div className="app-bg flex h-full min-h-screen flex-col">
      {!isLanding && (
        <nav className="flex h-14 shrink-0 items-center justify-between border-b border-line/40 bg-[#FAF9F6] px-6">
          <div className="flex w-1/3 items-center justify-start">
            {!isCall && (
              <button
                type="button"
                onClick={() => navigate(backPath())}
                className="group flex items-center gap-1.5 text-sm font-medium text-mist transition hover:text-parchment"
              >
                <svg width="10" height="16" viewBox="0 0 10 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-mist group-hover:text-parchment transition">
                  <path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>
            )}
          </div>
          <div className="flex w-1/3 items-center justify-center">
            <span className="font-display text-lg tracking-wide text-parchment" style={{ fontFamily: 'var(--font-display)' }}>
              Off the Page
            </span>
          </div>
          <div className="flex w-1/3 items-center justify-end">
            {isCall && (
               <span className="text-xs font-semibold uppercase tracking-widest text-ember">
                 Live Session
               </span>
            )}
          </div>
        </nav>
      )}

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route
            path="/"
            element={<Landing onStart={() => navigate('/stories')} />}
          />
          <Route
            path="/stories"
            element={
              <StoryLibrary
                onNew={() => clearAndNavigate('/stories/new')}
                onOpen={(storyId) => navigate(charactersPath(storyId))}
              />
            }
          />
          <Route
            path="/stories/new"
            element={
              <StoryUpload
                onReady={(story, characters, summary) => {
                  setWorkflow({
                    ...emptyWorkflowState,
                    story,
                    characters,
                    summary,
                  })
                  navigate(charactersPath(story.id))
                }}
              />
            }
          />
          <Route
            path="/stories/:storyId"
            element={
              <CharacterRoute
                workflow={workflow}
                setWorkflow={setWorkflow}
                onStartCall={(next) => {
                  setWorkflow(next)
                  navigate(roomPath(next.story!.id, next.session!.sessionId))
                }}
              />
            }
          />
          <Route
            path="/stories/:storyId/rooms/:sessionId"
            element={
              <RoomRoute
                workflow={workflow}
                onFinalStory={(artifact) => {
                  setWorkflow((current) => ({ ...current, artifact }))
                  navigate(finalPath(workflow.story!.id))
                }}
              />
            }
          />
          <Route
            path="/stories/:storyId/final"
            element={
              <FinalRoute
                workflow={workflow}
                onStartOver={() => clearAndNavigate('/stories/new')}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function CharacterRoute({
  workflow,
  setWorkflow,
  onStartCall,
}: {
  workflow: WorkflowState
  setWorkflow: Dispatch<SetStateAction<WorkflowState>>
  onStartCall: (state: WorkflowState) => void
}) {
  const { storyId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydratedStoryId, setHydratedStoryId] = useState<string | null>(null)
  const matchesStory = Boolean(storyId && workflow.story?.id === storyId)
  const needsHydration =
    !matchesStory ||
    workflow.characters.some((character) => !character.voice_id)

  useEffect(() => {
    if (
      !storyId ||
      !needsHydration ||
      hydratedStoryId === storyId
    ) {
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    getStory(storyId)
      .then((result) => {
        if (!active) return
        setWorkflow({
          ...emptyWorkflowState,
          story: result.story,
          characters: result.characters,
          summary: result.summary,
        })
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not load story')
        }
      })
      .finally(() => {
        if (active) {
          setHydratedStoryId(storyId)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [hydratedStoryId, needsHydration, setWorkflow, storyId])

  if (!storyId) {
    return <Navigate to="/stories" replace />
  }
  if (!matchesStory) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm text-mist">
            {loading ? 'Loading story…' : error || 'Opening story…'}
          </p>
          {error && (
            <button
              type="button"
              onClick={() => navigate('/stories')}
              className="mt-4 rounded-full border border-line px-4 py-2 text-sm text-parchment"
            >
              Return to stories
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <CharacterSelect
      story={workflow.story!}
      characters={workflow.characters}
      summary={workflow.summary}
      onCharactersChange={(characters) =>
        setWorkflow((current) => ({ ...current, characters }))
      }
      onStartCall={(selected, session, greeting, selectedCharacters) =>
        onStartCall({
          ...workflow,
          selected,
          selectedCharacters: selectedCharacters || [selected],
          session,
          greeting,
          artifact: null,
        })
      }
    />
  )
}

function RoomRoute({
  workflow,
  onFinalStory,
}: {
  workflow: WorkflowState
  onFinalStory: (artifact: StoryArtifact) => void
}) {
  const { storyId, sessionId } = useParams()
  if (
    !workflow.story ||
    !workflow.selected ||
    !workflow.session ||
    workflow.story.id !== storyId ||
    workflow.session.sessionId !== sessionId
  ) {
    return <Navigate to={storyId ? charactersPath(storyId) : '/stories'} replace />
  }
  return (
    <div className="h-[calc(100vh-56px)]">
      <CallRoom
        story={workflow.story}
        character={workflow.selected}
        selectedCharacters={workflow.selectedCharacters}
        session={workflow.session}
        greeting={workflow.greeting}
        onFinalStory={onFinalStory}
      />
    </div>
  )
}

function FinalRoute({
  workflow,
  onStartOver,
}: {
  workflow: WorkflowState
  onStartOver: () => void
}) {
  const { storyId } = useParams()
  if (
    !workflow.story ||
    !workflow.session ||
    !workflow.artifact ||
    workflow.story.id !== storyId
  ) {
    return <Navigate to={storyId ? charactersPath(storyId) : '/stories'} replace />
  }
  return (
    <FinalStory
      story={workflow.story}
      session={workflow.session}
      artifact={workflow.artifact}
      onStartOver={onStartOver}
    />
  )
}

function charactersPath(storyId: string): string {
  return `/stories/${encodeURIComponent(storyId)}`
}

function roomPath(storyId: string, sessionId: string): string {
  return `/stories/${encodeURIComponent(storyId)}/rooms/${encodeURIComponent(sessionId)}`
}

function finalPath(storyId: string): string {
  return `/stories/${encodeURIComponent(storyId)}/final`
}
