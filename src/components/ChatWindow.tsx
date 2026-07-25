import { useEffect, useRef, useState } from 'react'
import { Send, Mic, Square } from 'lucide-react'
import type { Character, ChatMessage } from '../types'

interface ChatWindowProps {
  character: Character
  messages: ChatMessage[]
  isTyping: boolean
  onSend: (text: string) => void
  disabled?: boolean
}

export function ChatWindow({
  character,
  messages,
  isTyping,
  onSend,
  disabled,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const t = draft.trim()
    if (!t || disabled || isTyping) return
    onSend(t)
    setDraft('')
  }

  function toggleMic() {
    const SR =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined

    if (!SR) {
      alert('Speech recognition is not supported in this browser. Try Chrome.')
      return
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
      return
    }

    const rec = new SR()
    recognitionRef.current = rec
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setDraft(transcript)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
    setListening(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-line bg-ink-soft/60">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-ink"
          style={{ backgroundColor: character.avatar_color || '#e8a45a' }}
        >
          {character.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-parchment">
            Chat with {character.name}
          </p>
          <p className="text-[11px] text-mist">Stays in character · story-bound knowledge</p>
        </div>
      </div>

      <div className="custom-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-lg text-parchment-dim" style={{ fontFamily: 'var(--font-display)' }}>
              The line is open.
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-mist">
              Ask about motives, unwritten scenes, or contradictions. They only
              answer from what the story knows.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSend(p)}
                  className="rounded-full border border-line bg-ink/40 px-3 py-1.5 text-[11px] text-mist transition hover:border-ember/30 hover:text-parchment"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} character={character} />
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-ink-muted px-4 py-3">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-mist" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-mist" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-mist" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-line bg-ink/50 px-2 py-2 focus-within:border-ember/35">
          <button
            type="button"
            onClick={toggleMic}
            className={`mb-0.5 rounded-lg p-2 transition ${
              listening
                ? 'bg-rose/20 text-rose'
                : 'text-mist hover:bg-ink-muted hover:text-parchment'
            }`}
            title={listening ? 'Stop listening' : 'Dictate'}
          >
            {listening ? <Square size={16} /> : <Mic size={16} />}
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={`Message ${character.name}…`}
            disabled={disabled}
            className="custom-scroll max-h-28 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-sm text-parchment outline-none placeholder:text-mist/50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || disabled || isTyping}
            className="mb-0.5 rounded-lg bg-ember p-2 text-ink transition enabled:hover:brightness-110 disabled:opacity-30"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}

function MessageBubble({
  message,
  character,
}: {
  message: ChatMessage
  character: Character
}) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <p className="max-w-[90%] rounded-full border border-line bg-ink/40 px-3 py-1 text-center text-[11px] text-mist">
          {message.content}
        </p>
      </div>
    )
  }

  const mine = message.role === 'user'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine
            ? 'rounded-br-md bg-ember/20 text-parchment'
            : 'rounded-bl-md bg-ink-muted text-parchment-dim'
        }`}
      >
        {!mine && (
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-ember/80">
            {message.characterName || character.name}
          </p>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

const PROMPTS = [
  'What are you afraid to admit?',
  'How would you react if…?',
  'Does this moment feel true to you?',
  'What does the story not know about you?',
]

/* SpeechRecognition types for browsers that support it */
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}
