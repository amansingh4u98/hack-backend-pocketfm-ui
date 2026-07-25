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

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-6 py-10 lg:grid-cols-[1fr_1.15fr]">
        <div className="animate-fade-up space-y-5">
          <div>
            <h1
              className="font-display text-3xl text-parchment md:text-4xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Lay the story on the table
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-parchment-dim">
              Paste a draft or drop PDF / DOC / TXT. Text is read in the
              browser, then sent to{' '}
              <code className="text-ember font-semibold">POST /actor-context/extract</code>{' '}
              for story + character intelligence. If the API is down, we fall
              back to a local cast so you can still demo the UI.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-mist">
              Working title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Last Letter to Elias"
              className="w-full rounded-md border border-line bg-ink-soft px-4 py-3 text-sm text-parchment shadow-sm outline-none transition placeholder:text-mist/50 focus:border-ember focus:ring-1 focus:ring-ember"
            />
          </label>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`relative rounded-md border-2 border-dashed p-8 text-center transition ${
              dragOver
                ? 'border-ember bg-ember/10'
                : 'border-line bg-ink-soft hover:border-ember/40'
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
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-sm bg-ink text-ember border border-line shadow-sm">
                  <Upload size={20} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-parchment">
                  Drop story file here
                </p>
                <p className="mt-1 text-xs text-mist">PDF · DOC/DOCX · TXT · MD</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-4 rounded-sm border border-line bg-ink px-4 py-2 text-xs font-medium text-mist transition hover:border-ember/40 hover:text-parchment"
                >
                  Browse files
                </button>
              </>
            )}
          </div>

          {fileName && (
            <div className="flex items-center gap-3 rounded-md border border-line bg-ink-soft px-3 py-2.5 shadow-sm">
              <FileType size={16} className="text-ember" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-parchment">{fileName}</p>
                <p className="text-[11px] uppercase tracking-wider text-mist">
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
                className="rounded-sm p-1.5 text-mist hover:bg-ink-muted hover:text-parchment"
                aria-label="Clear file"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="space-y-2 rounded-md border border-line bg-ink-muted p-4 text-xs leading-relaxed text-mist">
            <p className="font-semibold text-parchment">Backend pipeline</p>
            <ol className="list-decimal space-y-1 pl-4 font-mono text-[11px] text-parchment-dim">
              <li>POST /actor-context/extract</li>
              <li>cast ← extraction.characters</li>
              <li>POST /actor-context/bootstrap → live token</li>
              <li>WS …/live?token=…</li>
            </ol>
            <p className="text-[11px] text-mist">
              Requires backend OpenAI keys for real extraction; Mongo +{' '}
              <code className="text-ember">LIVE_TOKEN_SECRET</code> for calls.
            </p>
          </div>
        </div>

        <div className="animate-fade-up flex flex-col" style={{ animationDelay: '0.08s' }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mist">
              <FileText size={14} />
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
            className="custom-scroll min-h-[360px] flex-1 resize-none rounded-md border border-line bg-ink-soft p-5 font-display text-lg leading-relaxed text-parchment shadow-inner outline-none transition placeholder:text-mist/40 focus:border-ember focus:ring-1 focus:ring-ember"
            style={{ fontFamily: 'var(--font-display)' }}
          />

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2.5 text-sm font-medium text-rose">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-4 py-2.5 text-sm font-medium text-mist transition hover:bg-ink-soft hover:text-parchment"
            >
              Back
            </button>
            <button
              type="button"
              disabled={loading || !text.trim()}
              onClick={() => void submit()}
              className="inline-flex items-center gap-2 rounded-md bg-ember px-6 py-3 text-sm font-medium text-ink shadow-sm transition enabled:hover:bg-ember-bright disabled:cursor-not-allowed disabled:opacity-40"
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
