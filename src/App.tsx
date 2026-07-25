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
    <div className="app-bg h-full min-h-screen">
      {step === 'landing' && (
        <Landing onStart={() => setStep('upload')} />
      )}

      {step === 'upload' && (
        <StoryUpload
          onBack={() => setStep('landing')}
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
          onBack={resetToUpload}
          onStartCall={(character, liveSession, greet) => {
            setSelected(character)
            setSession(liveSession)
            setGreeting(greet)
            setStep('call')
          }}
        />
      )}

      {step === 'call' && story && selected && session && (
        <div className="h-screen">
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
    </div>
  )
}
