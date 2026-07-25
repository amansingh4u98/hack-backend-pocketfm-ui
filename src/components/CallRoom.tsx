import { useCallback, useEffect, useState } from 'react'
import type {
  Character,
  ChatMessage,
  LiveSession,
  StoryContext,
} from '../types'
import { endSession, sendChatTurn } from '../api/client'
import { ChatWindow } from './ChatWindow'
import { VideoStage } from './VideoStage'
import { Brand } from './Landing'

interface CallRoomProps {
  story: StoryContext
  character: Character
  session: LiveSession
  greeting?: string
  onEndCall: () => void
  onLeaveStudio: () => void
}

export function CallRoom({
  story,
  character,
  session,
  greeting,
  onEndCall,
  onLeaveStudio,
}: CallRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const base: ChatMessage[] = [
      {
        id: 'sys-1',
        role: 'system',
        content:
          session.mode === 'live'
            ? `Live room · session ${session.sessionId.slice(0, 8)}… · story-bound knowledge`
            : `Offline demo · ${character.name} (local replies until studio session + WS are live)`,
        timestamp: new Date().toISOString(),
      },
    ]
    if (greeting) {
      base.push({
        id: 'greet-1',
        role: 'character',
        content: greeting,
        timestamp: new Date().toISOString(),
        characterName: character.name,
      })
    }
    if (character.sample_quotes?.[0]) {
      base.push({
        id: 'sys-quote',
        role: 'system',
        content: `Voice sample from extraction: “${character.sample_quotes[0]}”`,
        timestamp: new Date().toISOString(),
      })
    }
    return base
  })
  const [isTyping, setIsTyping] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(Boolean(greeting))

  useEffect(() => {
    if (!greeting) return
    const t = setTimeout(() => setIsSpeaking(false), 2500)
    return () => clearTimeout(t)
  }, [greeting])

  const finishCall = useCallback(async () => {
    await endSession(session)
    onEndCall()
  }, [session, onEndCall])

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      }
      setMessages((m) => [...m, userMsg])
      setIsTyping(true)
      setIsSpeaking(false)

      try {
        const res = await sendChatTurn({
          session,
          character,
          message: text,
        })
        const reply: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'character',
          content: res.reply,
          timestamp: new Date().toISOString(),
          characterName: res.character_name || character.name,
        }
        setMessages((m) => [...m, reply])
        if (res.video_url) setVideoUrl(res.video_url)
        setIsSpeaking(true)
        setTimeout(
          () => setIsSpeaking(false),
          Math.min(4000, Math.max(1200, res.reply.length * 40)),
        )
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'system',
            content:
              e instanceof Error
                ? `Turn failed: ${e.message}`
                : 'Turn failed',
            timestamp: new Date().toISOString(),
          },
        ])
      } finally {
        setIsTyping(false)
      }
    },
    [session, character],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 md:px-6">
        <button type="button" onClick={onLeaveStudio} className="text-left">
          <Brand />
        </button>
        <div className="hidden text-center sm:block">
          <p className="text-xs text-mist">
            {session.mode === 'live' ? 'Live with' : 'Demo with'}
          </p>
          <p className="text-sm font-medium text-parchment">{character.name}</p>
        </div>
        <button
          type="button"
          onClick={() => void finishCall()}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-mist transition hover:border-rose/40 hover:text-rose"
        >
          End call
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[1.35fr_1fr] md:p-6">
        <div className="min-h-[360px] md:min-h-0">
          <VideoStage
            character={character}
            isLive={session.mode === 'live'}
            isSpeaking={isSpeaking || isTyping}
            videoUrl={videoUrl}
            storyTitle={story.title}
            onEndCall={() => void finishCall()}
          />
        </div>
        <div className="min-h-[320px] md:min-h-0">
          <ChatWindow
            character={character}
            messages={messages}
            isTyping={isTyping}
            onSend={(t) => void handleSend(t)}
          />
        </div>
      </div>
    </div>
  )
}
