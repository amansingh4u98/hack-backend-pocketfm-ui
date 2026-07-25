import { useState } from 'react'
import type {
  AppStep,
  Character,
  LiveSession,
  StoryContext,
} from './types'
import { Landing } from './components/Landing'
import { StoryUpload } from './components/StoryUpload'
import { CharacterSelect } from './components/CharacterSelect'
import { CallRoom } from './components/CallRoom'

export default function App() {
  const [step, setStep] = useState<AppStep>('landing')
  const [story, setStory] = useState<StoryContext | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [summary, setSummary] = useState<string | undefined>()
  const [selected, setSelected] = useState<Character | null>(null)
  const [session, setSession] = useState<LiveSession | null>(null)
  const [greeting, setGreeting] = useState<string | undefined>()

  function resetToUpload() {
    setStep('upload')
    setSelected(null)
    setSession(null)
    setGreeting(undefined)
  }

  function leaveStudio() {
    setStep('landing')
    setStory(null)
    setCharacters([])
    setSummary(undefined)
    setSelected(null)
    setSession(null)
    setGreeting(undefined)
  }

  return (
    <div className="app-bg flex h-full min-h-screen flex-col">
      {/* Apple-style minimalist top navigation bar */}
      {step !== 'landing' && (
        <nav className="flex h-14 shrink-0 items-center justify-between border-b border-line/40 bg-[#FAF9F6] px-6">
          <div className="flex w-1/3 items-center justify-start">
            {step !== 'call' && (
              <button
                type="button"
                onClick={step === 'upload' ? leaveStudio : resetToUpload}
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
            {step === 'call' && (
               <span className="text-xs font-semibold uppercase tracking-widest text-ember">
                 Live Session
               </span>
            )}
          </div>
        </nav>
      )}

      <main className="flex-1 overflow-auto">
        {step === 'landing' && (
          <Landing onStart={() => setStep('upload')} />
        )}

        {step === 'upload' && (
          <StoryUpload
            onReady={(s, chars, sum) => {
              setStory(s)
              setCharacters(chars)
              setSummary(sum)
              setStep('characters')
            }}
          />
        )}

        {step === 'characters' && story && (
          <CharacterSelect
            story={story}
            characters={characters}
            summary={summary}
            onStartCall={(character, liveSession, greet) => {
              setSelected(character)
              setSession(liveSession)
              setGreeting(greet)
              setStep('call')
            }}
          />
        )}

        {step === 'call' && story && selected && session && (
          <div className="h-[calc(100vh-56px)]">
            <CallRoom
              story={story}
              character={selected}
              session={session}
              greeting={greeting}
              onEndCall={() => {
                setSelected(null)
                setSession(null)
                setGreeting(undefined)
                setStep('characters')
              }}
              onLeaveStudio={leaveStudio}
            />
          </div>
        )}
      </main>
    </div>
  )
}
