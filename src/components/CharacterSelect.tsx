import { useState } from 'react'
import { ArrowRight, Loader2, UserRound, Sparkles } from 'lucide-react'
import type { Character, LiveSession, StoryContext } from '../types'
import { startCall } from '../api/client'
import { Brand } from './Landing'
import { BackendStatus } from './BackendStatus'

interface CharacterSelectProps {
  story: StoryContext
  characters: Character[]
  summary?: string
  onBack: () => void
  onStartCall: (
    character: Character,
    session: LiveSession,
    greeting?: string,
  ) => void
}

export function CharacterSelect({
  story,
  characters,
  summary,
  onBack,
  onStartCall,
}: CharacterSelectProps) {
  const [selected, setSelected] = useState<Character | null>(
    characters[0] ?? null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asOfScene, setAsOfScene] = useState<number | undefined>(undefined)

  async function joinCall() {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      const res = await startCall({
        story,
        character: selected,
        castIds: characters.map((c) => c.id),
        asOfScene: asOfScene,
      })
      onStartCall(res.character, res.session, res.greeting)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <button type="button" onClick={onBack} className="text-left">
          <Brand />
        </button>
        <div className="flex items-center gap-3">
          <BackendStatus />
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-mist">
            Step 2 · Cast
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="animate-fade-up mb-8 max-w-2xl">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-ember">
            {story.title}
          </p>
          <h1
            className="font-display text-3xl text-parchment md:text-4xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Who do you want on the other end?
          </h1>
          <p className="mt-2 text-sm text-mist">
            Characters come from extraction. Starting a call bootstraps a room
            and mints a live token for the WebSocket session.
          </p>
          {summary && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-ink-soft/50 px-3 py-2 text-xs text-mist">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-ember" />
              {summary}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3 rounded-sm border border-line bg-ink-soft p-4 shadow-sm">
            <label htmlFor="asOfScene" className="text-sm font-medium text-parchment">
              Timeline Cutoff:
            </label>
            <input
              type="number"
              id="asOfScene"
              min="0"
              placeholder="e.g. 5"
              value={asOfScene ?? ''}
              onChange={(e) => setAsOfScene(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="w-24 rounded-sm border border-line bg-ink px-3 py-1.5 text-sm text-parchment placeholder:text-mist/50 focus:border-ember focus:outline-none"
            />
            <span className="text-xs text-mist">
              Only expose facts known before this scene
            </span>
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c, i) => {
            const active = selected?.id === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className={`animate-fade-up group relative p-6 text-left transition ${
                  active
                    ? 'bg-ink-soft'
                    : 'bg-transparent hover:bg-ink-soft/50'
                }`}
                style={{ animationDelay: `${0.04 * i}s` }}
              >
                {/* Minimal top border acting as a divider instead of a box */}
                <div className={`absolute top-0 left-6 right-6 h-[1px] transition ${active ? 'bg-ember' : 'bg-line group-hover:bg-line'}`} />

                <div className="mb-6 mt-2 flex items-start justify-between gap-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-muted text-lg font-display text-parchment">
                    {initials(c.name)}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {c.importance && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mist">
                        {c.importance}
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="mb-2 font-display text-xl text-parchment" style={{ fontFamily: 'var(--font-display)' }}>
                  {c.name}
                </h3>
                {c.role && (
                  <p className="mt-0.5 text-xs uppercase tracking-wider text-mist">
                    {c.role}
                  </p>
                )}
                {c.aliases && c.aliases.length > 0 && (
                  <p className="mt-1 text-[11px] text-mist/80">
                    aka {c.aliases.join(', ')}
                  </p>
                )}
                {c.description && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-mist">
                    {c.description}
                  </p>
                )}
                {c.personality && (
                  <p className="mt-2 text-xs text-parchment-dim/80">
                    Voice: {c.personality}
                  </p>
                )}
                {c.motivation && (
                  <p className="mt-1 line-clamp-2 text-xs text-mist">
                    Wants: {c.motivation}
                  </p>
                )}
                {typeof c.secrets_count === 'number' && c.secrets_count > 0 && (
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-rose/80">
                    {c.secrets_count} secret{c.secrets_count === 1 ? '' : 's'}
                  </p>
                )}
              </button>
            )
          })}

          {characters.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-16 text-center">
              <UserRound className="mb-3 text-mist" size={28} />
              <p className="text-sm text-mist">
                No characters in extraction. Go back and try richer dialogue, or
                check the extraction payload.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 font-mono text-[11px] text-mist">
          POST /actor-context/bootstrap → WS /v1/rooms/…/sessions/…/live
        </p>

        {error && <p className="mt-3 text-sm text-rose">{error}</p>}

        <div className="mt-12 flex items-center justify-between border-t border-line/50 pt-8">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full px-5 py-2.5 text-sm font-medium text-mist transition hover:bg-ink-soft hover:text-parchment"
          >
            Back to story
          </button>
          <button
            type="button"
            disabled={!selected || loading}
            onClick={() => void joinCall()}
            className="inline-flex items-center gap-2 rounded-full bg-parchment px-8 py-3 text-sm font-medium text-ink transition enabled:hover:bg-parchment-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Opening room…
              </>
            ) : (
              <>
                Start video call
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}
