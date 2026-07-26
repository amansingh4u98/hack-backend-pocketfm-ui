import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  Loader2,
  Settings2,
  Sparkles,
  UserRound,
  Video,
} from 'lucide-react'
import type {
  Character,
  CharacterAssetUpdate,
  LiveSession,
  SessionParticipant,
  StoryContext,
} from '../types'
import { startCall } from '../api/client'
import { CharacterAssetSetup } from './CharacterAssetSetup'

interface CharacterSelectProps {
  story: StoryContext
  characters: Character[]
  summary?: string
  onCharactersChange?: (characters: Character[]) => void
  onStartCall: (
    character: Character,
    session: LiveSession,
    greeting?: string,
    selectedCharacters?: Character[],
  ) => void
}

export function CharacterSelect({
  story,
  characters,
  summary,
  onCharactersChange,
  onStartCall,
}: CharacterSelectProps) {
  const [cast, setCast] = useState(characters)
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(characters.map((character) => character.id)),
  )
  const [focusedId, setFocusedId] = useState<string | undefined>(
    characters[0]?.id,
  )
  const [assetCharacterId, setAssetCharacterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asOfScene, setAsOfScene] = useState<number | undefined>(undefined)

  const selectedCast = useMemo(
    () => cast.filter((character) => selectedIds.has(character.id)),
    [cast, selectedIds],
  )
  const focusedCharacter =
    selectedCast.find((character) => character.id === focusedId) ||
    selectedCast[0] ||
    null
  const assetCharacter = cast.find((character) => character.id === assetCharacterId)

  function toggleCharacter(character: Character) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(character.id)) {
        next.delete(character.id)
        if (focusedId === character.id) {
          setFocusedId(cast.find((item) => next.has(item.id))?.id)
        }
      } else {
        next.add(character.id)
        setFocusedId((focused) => focused || character.id)
      }
      return next
    })
  }

  function updateCharacter(characterId: string, update: CharacterAssetUpdate) {
    const next = cast.map((character) =>
      character.id === characterId
        ? {
            ...character,
            ...(update.imageUrl !== undefined ? { image_url: update.imageUrl } : {}),
            ...(update.voiceId !== undefined ? { voice_id: update.voiceId } : {}),
            ...(update.voiceName !== undefined
              ? { voice_name: update.voiceName }
              : {}),
          }
        : character,
    )
    setCast(next)
    onCharactersChange?.(next)
  }

  async function joinCall() {
    if (!focusedCharacter || !selectedCast.length) return
    setLoading(true)
    setError(null)
    const participants: SessionParticipant[] = [
      { id: 'director', name: 'Director', type: 'director' },
      ...selectedCast.map((character) => ({
        id: character.id,
        characterId: character.id,
        name: character.name,
        type: 'character' as const,
        voiceId: character.voice_id,
        imageUrl: character.image_url,
        focused: character.id === focusedCharacter.id,
      })),
    ]
    try {
      const res = await startCall({
        story,
        character: focusedCharacter,
        cast: selectedCast,
        participants,
        asOfScene,
      })
      onStartCall(res.character, res.session, res.greeting, selectedCast)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="animate-fade-up mb-8 max-w-3xl">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-ember">
            {story.title}
          </p>
          <h1 className="font-display text-3xl text-parchment md:text-4xl">
            Build your room
          </h1>
          <p className="mt-2 text-sm text-mist">
            Select any number of characters, configure their assets, and choose one
            focused character for the current call-room layout. The Director is always
            present.
          </p>
          {summary && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-ink-soft/50 px-3 py-2 text-xs text-mist">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-ember" />
              {summary}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-sm border border-line bg-ink-soft p-4 shadow-sm">
            <label htmlFor="asOfScene" className="text-sm font-medium text-parchment">
              Timeline cutoff
            </label>
            <input
              type="number"
              id="asOfScene"
              min="0"
              placeholder="e.g. 5"
              value={asOfScene ?? ''}
              onChange={(event) =>
                setAsOfScene(
                  event.target.value ? Number.parseInt(event.target.value, 10) : undefined,
                )
              }
              className="w-24 rounded-sm border border-line bg-ink px-3 py-1.5 text-sm text-parchment placeholder:text-mist/50 focus:border-ember focus:outline-none"
            />
            <span className="text-xs text-mist">
              Only expose facts known before this scene
            </span>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <article className="relative border-t border-ember bg-ink-soft p-6">
            <div className="mb-5 flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ember text-white">
                <Video size={20} />
              </div>
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
                <Check size={12} /> Always selected
              </span>
            </div>
            <h3 className="font-display text-xl text-parchment">Director</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              Facilitates the room, routes the conversation, and keeps participants
              grounded in your story.
            </p>
          </article>

          {cast.map((character, index) => {
            const selected = selectedIds.has(character.id)
            const focused = focusedCharacter?.id === character.id
            return (
              <article
                key={character.id}
                className={`animate-fade-up relative border-t p-6 transition ${
                  selected ? 'border-ember bg-ink-soft' : 'border-line hover:bg-ink-soft/50'
                }`}
                style={{ animationDelay: `${0.04 * index}s` }}
              >
                <button
                  type="button"
                  onClick={() => toggleCharacter(character)}
                  className="absolute inset-0"
                  aria-label={`${selected ? 'Remove' : 'Add'} ${character.name} ${selected ? 'from' : 'to'} cast`}
                />
                <div className="pointer-events-none relative">
                  <div className="mb-5 flex items-start justify-between gap-2">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-muted text-lg font-display text-parchment"
                      style={{ backgroundColor: character.image_url ? undefined : character.avatar_color }}
                    >
                      {character.image_url ? (
                        <img
                          src={character.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initials(character.name)
                      )}
                    </div>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        selected
                          ? 'border-ember bg-ember text-white'
                          : 'border-line text-transparent'
                      }`}
                    >
                      <Check size={14} />
                    </span>
                  </div>
                  <h3 className="font-display text-xl text-parchment">{character.name}</h3>
                  <p className="mt-1 text-xs uppercase tracking-wider text-mist">
                    {character.role || character.importance || 'Character'}
                  </p>
                  {character.description && (
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-mist">
                      {character.description}
                    </p>
                  )}
                  <p className="mt-3 text-[11px] text-mist">
                    {character.voice_name
                      ? `Voice: ${character.voice_name}`
                      : 'Voice not assigned'}
                    {' · '}
                    {character.image_url ? 'Avatar ready' : 'No avatar'}
                  </p>
                </div>
                <div className="relative mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAssetCharacterId((current) =>
                        current === character.id ? null : character.id,
                      )
                    }
                    className="flex items-center gap-1.5 rounded-full border border-line bg-ink px-3 py-1.5 text-xs text-parchment hover:border-ember"
                  >
                    <Settings2 size={13} /> Assets
                  </button>
                  {selected && (
                    <button
                      type="button"
                      onClick={() => setFocusedId(character.id)}
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        focused
                          ? 'bg-ember text-white'
                          : 'border border-line bg-ink text-mist hover:border-ember'
                      }`}
                    >
                      {focused ? 'Focused' : 'Use as focus'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}

          {assetCharacter && (
            <CharacterAssetSetup
              key={assetCharacter.id}
              story={story}
              character={assetCharacter}
              onUpdate={(update) => updateCharacter(assetCharacter.id, update)}
            />
          )}

          {cast.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-16 text-center">
              <UserRound className="mb-3 text-mist" size={28} />
              <p className="text-sm text-mist">
                No characters were returned by extraction.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-mist">
          Director + {selectedCast.length} cast member
          {selectedCast.length === 1 ? '' : 's'} selected
        </p>
        {error && <p className="mt-3 text-sm text-rose">{error}</p>}

        <div className="mt-12 flex items-center justify-between gap-4 border-t border-line/50 pt-8">
          <p className="text-xs text-mist">
            {focusedCharacter
              ? `${focusedCharacter.name} is the focused legacy CallRoom participant.`
              : 'Select at least one character.'}
          </p>
          <button
            type="button"
            disabled={!focusedCharacter || loading}
            onClick={() => void joinCall()}
            className="inline-flex items-center gap-2 rounded-full bg-parchment px-8 py-3 text-sm font-medium text-ink transition enabled:hover:bg-parchment-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Opening room…
              </>
            ) : (
              <>
                Start cast session <ArrowRight size={16} />
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
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
