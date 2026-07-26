import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Loader2, Plus } from 'lucide-react'
import { listStories } from '../api/client'
import type { StorySummary } from '../types'

interface StoryLibraryProps {
  onNew: () => void
  onOpen: (storyId: string) => void
}

export function StoryLibrary({ onNew, onOpen }: StoryLibraryProps) {
  const [stories, setStories] = useState<StorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listStories()
      .then((items) => {
        if (active) setStories(items)
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not load stories')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Story library
          </p>
          <h1 className="font-display text-4xl text-parchment">Your writers’ rooms</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist">
            Open a saved story to review its cast or continue into a live room.
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-2 rounded-full bg-parchment px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-parchment-dim"
        >
          <Plus size={16} /> New story
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-sm text-mist">
          <Loader2 className="mr-2 animate-spin" size={17} /> Loading stories…
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose/20 bg-rose/10 px-4 py-3 text-sm text-rose">
          {error}
        </p>
      )}

      {!loading && !error && stories.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line py-20 text-center">
          <BookOpen className="mb-4 text-ember" size={30} />
          <h2 className="font-display text-2xl text-parchment">No stories yet</h2>
          <p className="mt-2 text-sm text-mist">Create your first story to begin.</p>
          <button
            type="button"
            onClick={onNew}
            className="mt-6 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white"
          >
            Create story
          </button>
        </div>
      )}

      {!loading && stories.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => onOpen(story.id)}
              className="group min-w-0 rounded-2xl border border-line bg-ink-soft p-6 text-left transition hover:border-ember/50"
            >
              <div className="mb-8 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-muted text-ember">
                  <BookOpen size={19} />
                </div>
                <span className="text-[11px] text-mist">
                  {story.character_count} character
                  {story.character_count === 1 ? '' : 's'}
                </span>
              </div>
              <h2 className="truncate font-display text-2xl text-parchment">
                {story.title}
              </h2>
              <p className="mt-3 line-clamp-3 min-h-16 text-sm leading-relaxed text-mist">
                {story.logline || story.short_synopsis || 'Saved story'}
              </p>
              <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="text-[11px] text-mist">
                  {new Date(story.updated_at).toLocaleDateString()}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ember">
                  Open <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
