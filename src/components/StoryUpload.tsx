import { useCallback, useRef, useState } from 'react'
import {
  FileText,
  Loader2,
  Upload,
  FileType,
  X,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { extractTextFromFile, guessTitle } from '../lib/parseStory'
import { ingestStory } from '../api/client'
import type { Character, StoryContext } from '../types'
import { Brand } from './Landing'
import { BackendStatus } from './BackendStatus'

interface StoryUploadProps {
  onBack: () => void
  onReady: (
    story: StoryContext,
    characters: Character[],
    summary?: string,
    mode?: 'live' | 'offline',
  ) => void
}

export function StoryUpload({ onBack, onReady }: StoryUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState<StoryContext['source']>('paste')
  const [fileName, setFileName] = useState<string | undefined>()
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setParsing(true)
    try {
      const { text: extracted, source: src } = await extractTextFromFile(file)
      if (!extracted.trim()) {
        throw new Error('Could not extract any text from that file.')
      }
      setText(extracted)
      setSource(src)
      setFileName(file.name)
      setTitle((t) => t || guessTitle(extracted, file.name))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file')
    } finally {
      setParsing(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  async function submit() {
    const body = text.trim()
    if (!body) {
      setError('Paste or upload a story first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await ingestStory({
        title: title.trim() || guessTitle(body, fileName),
        text: body,
        source,
        fileName,
      })
      onReady(res.story, res.characters, res.summary, res.mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to ingest story')
    } finally {
      setLoading(false)
    }
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <button type="button" onClick={onBack} className="text-left">
          <Brand />
        </button>
        <div className="flex items-center gap-3">
          <BackendStatus />
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-mist">
            Step 1 · Story
          </span>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-12 px-6 py-12 lg:grid-cols-[1fr_1.15fr]">
        <div className="animate-fade-up space-y-8">
          <div>
            <h1
              className="font-display text-4xl text-parchment md:text-5xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Lay the story on the table
            </h1>
            <p className="mt-4 text-sm leading-loose text-mist">
              Paste a draft or drop PDF / DOC / TXT. Text is read in the
              browser, then sent to{' '}
              <code className="text-ember font-semibold">POST /actor-context/extract</code>{' '}
              for story + character intelligence. If the API is down, we fall
              back to a local cast so you can still demo the UI.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-mist">
              Working title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Last Letter to Elias"
              className="w-full border-b border-line bg-transparent py-3 text-lg font-display text-parchment outline-none transition placeholder:text-mist/50 focus:border-ember"
              style={{ fontFamily: 'var(--font-display)' }}
            />
          </label>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`relative rounded-2xl p-10 text-center transition ${
              dragOver
                ? 'bg-ember/5 border-ember/20 border'
                : 'bg-ink-soft hover:bg-ink-muted/50 border border-transparent'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            {parsing ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="animate-spin text-ember" size={28} />
                <p className="text-sm text-mist">Reading file…</p>
              </div>
            ) : (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-ember shadow-sm">
                  <Upload size={22} strokeWidth={1.5} />
                </div>
                <p className="font-display text-lg text-parchment">
                  Drop story file here
                </p>
                <p className="mt-1 text-xs text-mist">PDF · DOC/DOCX · TXT · MD</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-6 rounded-full border border-line bg-transparent px-5 py-2.5 text-xs font-medium text-mist transition hover:border-ember hover:text-parchment"
                >
                  Browse files
                </button>
              </>
            )}
          </div>

          {fileName && (
            <div className="flex items-center gap-4 border-l-2 border-ember bg-ink-soft px-4 py-3">
              <FileType size={18} className="text-ember" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-parchment">{fileName}</p>
                <p className="text-[11px] uppercase tracking-wider text-mist mt-0.5">
                  {source} · {wordCount.toLocaleString()} words
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFileName(undefined)
                  setSource('paste')
                  setText('')
                }}
                className="rounded-full p-2 text-mist hover:bg-ink-muted hover:text-parchment"
                aria-label="Clear file"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="animate-fade-up flex flex-col" style={{ animationDelay: '0.08s' }}>
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mist">
              <FileText size={16} />
              Story text
            </span>
            <span className="text-xs font-medium text-mist">
              {wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'Empty'}
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (!fileName) setSource('paste')
            }}
            placeholder={`Paste your story, scene, or character bible here…

Example:
Mira Voss stood on the platform long after the train had gone. She had hidden the letter in the lining of Elias's coat — the one truth that would have kept him home. Rain stitched the iron rails silver. "He'll never know," she whispered, and hated how much she needed that to be true.`}
            className="custom-scroll min-h-[360px] flex-1 resize-none rounded-2xl bg-ink-soft p-8 font-display text-lg leading-loose text-parchment outline-none transition placeholder:text-mist/40 focus:bg-ink-soft/70"
            style={{ fontFamily: 'var(--font-display)' }}
          />

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose/10 px-4 py-3 text-sm font-medium text-rose">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line/50 pt-8">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full px-5 py-2.5 text-sm font-medium text-mist transition hover:bg-ink-soft hover:text-parchment"
            >
              Back
            </button>
            <button
              type="button"
              disabled={loading || !text.trim()}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 rounded-full bg-parchment px-8 py-3 text-sm font-medium text-ink transition enabled:hover:bg-parchment-dim disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Extracting story…
                </>
              ) : (
                <>
                  Continue to cast
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
