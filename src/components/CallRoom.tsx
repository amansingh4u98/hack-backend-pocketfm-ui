import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleStop,
  MessagesSquare,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  Zap,
} from 'lucide-react'
import type {
  Character,
  ChatMessage,
  FinalizationProposal,
  LiveServerEvent,
  LiveSession,
  SessionParticipant,
  StoryArtifact,
  StoryContext,
} from '../types'
import {
  createStoryExport,
  endSession,
  getLiveClient,
  openLiveSession,
  sendChatTurn,
} from '../api/client'
import type { ConnectionState, LiveMediaState } from '../lib/liveSession'
import { AudioCapture } from '../lib/audioCapture'
import { AudioPlayer } from '../lib/audioPlayer'
import { ChatWindow } from './ChatWindow'

interface CallRoomProps {
  story: StoryContext
  character: Character
  selectedCharacters: Character[]
  session: LiveSession
  greeting?: string
  onFinalStory: (artifact: StoryArtifact) => void
}

interface Caption {
  id: string
  speaker: string
  text: string
  partial?: boolean
}

const EMPTY_MEDIA: LiveMediaState = {
  provider: 'pending',
  connected: false,
  microphoneMuted: true,
  activeSpeakerIds: [],
  participants: [],
  trackIds: [],
}

export function CallRoom({
  story,
  character,
  selectedCharacters,
  session,
  greeting,
  onFinalStory,
}: CallRoomProps) {
  const chatCharacter = useMemo<Character>(() => {
    const focused = session.participants?.find((participant) => participant.focused)
    if (focused?.type === 'director') {
      return {
        id: 'director',
        name: 'Director',
        role: 'Writers’ room facilitator',
        description:
          'Facilitates the room and helps the cast and writer develop the story.',
        voice_id: focused.voiceId || story.directorVoiceId,
        voice_name: story.directorVoiceName || 'Server default voice',
        image_url: focused.imageUrl,
        avatar_color: '#047857',
      }
    }
    if (focused?.characterId || focused?.id) {
      const focusedId = focused.characterId || focused.id
      return (
        selectedCharacters.find((item) => item.id === focusedId) || character
      )
    }
    return character
  }, [character, selectedCharacters, session.participants, story])

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'room-open',
      role: 'system',
      content:
        session.mode === 'live'
          ? 'The writers’ room is live. The Director and selected cast are present.'
          : 'Offline room preview',
      timestamp: new Date().toISOString(),
    },
    ...(greeting
      ? [{
          id: 'greeting',
          role: 'character' as const,
          content: greeting,
          characterName: chatCharacter.name,
          timestamp: new Date().toISOString(),
        }]
      : []),
  ])
  const [captions, setCaptions] = useState<Caption[]>([])
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [media, setMedia] = useState<LiveMediaState>(EMPTY_MEDIA)
  const [micMuted, setMicMuted] = useState(true)
  const [speechLanguage, setSpeechLanguage] = useState(
    () => window.localStorage.getItem('off-the-page:speech-language') || 'auto',
  )
  const [isTyping, setIsTyping] = useState(false)
  const [discussionActive, setDiscussionActive] = useState(false)
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [proposal, setProposal] = useState<FinalizationProposal | null>(null)
  const [revisionNotes, setRevisionNotes] = useState('')
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [artifact, setArtifact] = useState<StoryArtifact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playerRef = useRef<AudioPlayer | null>(null)
  const captureRef = useRef<AudioCapture | null>(null)
  const activeStreamRef = useRef<string | null>(null)
  const speechLanguageRef = useRef(speechLanguage)
  const streamMessageRef = useRef<{
    id: string
    agentId: string
    turnId?: string
  } | null>(null)

  const nameFor = useCallback(
    (id?: string) => {
      if (!id) return chatCharacter.name
      if (id.toLowerCase() === 'director') return 'Director'
      return (
        selectedCharacters.find(
          (item) => item.id === id || item.id === id.replace(/^char_/, ''),
        )?.name || humanize(id)
      )
    },
    [chatCharacter.name, selectedCharacters],
  )

  const addCaption = useCallback((caption: Caption) => {
    setCaptions((current) => [...current.filter((item) => item.id !== caption.id), caption].slice(-8))
  }, [])

  const handleEvent = useCallback(
    (event: LiveServerEvent) => {
      const eventId = String(event.event_id || event.turn_id || crypto.randomUUID())
      switch (event.type) {
        case 'speaker.selected': {
          const turnId = event.turn_id ? String(event.turn_id) : undefined
          if (streamMessageRef.current?.turnId !== turnId) {
            streamMessageRef.current = null
          }
          setActiveAgent(String(event.speaker_id || event.agent_id || ''))
          break
        }
        case 'agent.audio.started':
          setActiveAgent(String(event.speaker_id || event.agent_id || ''))
          break
        case 'agent.turn.completed':
        case 'agent.turn.cancelled':
        case 'turn.interrupted':
          setActiveAgent(null)
          streamMessageRef.current = null
          setIsTyping(false)
          break
        case 'transcript.partial':
          addCaption({ id: `writer-${event.stream_id || eventId}`, speaker: 'You', text: String(event.text || ''), partial: true })
          break
        case 'transcript.final':
          addCaption({ id: `writer-${event.stream_id || eventId}`, speaker: 'You', text: String(event.text || '') })
          if (event.text) {
            const messageId = `voice-${event.stream_id || eventId}`
            setMessages((items) =>
              items.some((item) => item.id === messageId)
                ? items
                : [...items, {
                    id: messageId,
                    role: 'user',
                    content: String(event.text),
                    timestamp: new Date().toISOString(),
                  }],
            )
          }
          break
        case 'speech.input.failed':
        case 'agent.turn.failed':
        case 'error':
          setError(String(event.message || 'The live room could not process that turn'))
          setIsTyping(false)
          break
        case 'discussion.started':
          setDiscussionActive(true)
          break
        case 'discussion.stopped':
          setDiscussionActive(false)
          break
        case 'story.finalization.proposed':
          setProposal({
            proposal_id: String(event.proposal_id || ''),
            summary: String(event.summary || ''),
            rationale: String(event.rationale || ''),
          })
          break
        case 'story.export.started':
          setExportStatus('Creating the final story…')
          break
        case 'story.export.completed': {
          const draft = event.draft
          if (draft && typeof draft === 'object') {
            const completed: StoryArtifact = {
              artifact_id: String(event.artifact_id || ''),
              draft: draft as StoryArtifact['draft'],
              download_url: String(event.download_url || ''),
            }
            setArtifact(completed)
            setExportStatus('Final story is ready')
            void endSession(session).finally(() => onFinalStory(completed))
          }
          break
        }
        case 'story.export.failed':
          setExportStatus(null)
          setError(String(event.message || 'Story export failed'))
          break
      }
    },
    [addCaption, onFinalStory, session],
  )

  const handleDelta = useCallback(
    (text: string, agentId = chatCharacter.id, turnId?: string) => {
      if (!text) return
      setActiveAgent(agentId)
      setIsTyping(true)
      const current = streamMessageRef.current
      if (
        !current ||
        current.agentId !== agentId ||
        (turnId && current.turnId !== turnId)
      ) {
        const id = turnId ? `agent-turn-${turnId}` : crypto.randomUUID()
        streamMessageRef.current = { id, agentId, turnId }
        setMessages((items) =>
          items.some((item) => item.id === id)
            ? items.map((item) =>
                item.id === id
                  ? { ...item, content: item.content + text }
                  : item,
              )
            : [
                ...items,
                {
                  id,
                  role: 'character',
                  content: text,
                  characterName: nameFor(agentId),
                  timestamp: new Date().toISOString(),
                },
              ],
        )
      } else {
        setMessages((items) =>
          items.map((item) => item.id === current.id ? { ...item, content: item.content + text } : item),
        )
      }
      setCaptions((current) => {
        const id = `agent-${turnId || agentId}`
        const previous = current.find((item) => item.id === id)?.text || ''
        return [
          ...current.filter((item) => item.id !== id),
          { id, speaker: nameFor(agentId), text: previous + text, partial: true },
        ].slice(-8)
      })
    },
    [chatCharacter.id, nameFor],
  )

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    const player = new AudioPlayer({
      onSpeakingChange: (speaking) => {
        if (!speaking && !cancelled) setActiveAgent(null)
      },
    })
    playerRef.current = player
    const capture = new AudioCapture((data) => getLiveClient(session.sessionId)?.sendBinary(data))
    captureRef.current = capture

    void openLiveSession(session)
      .then((client) => {
        if (!client || cancelled) return
        client.setSpeechLanguage(
          speechLanguageRef.current === 'auto' ? null : speechLanguageRef.current,
        )
        unsubscribe = client.subscribe({
          onAudio: (frame) => player.play(frame),
          onEvent: handleEvent,
          onTextDelta: handleDelta,
          onStateChange: setConnection,
          onMediaState: (state) => {
            setMedia(state)
            setMicMuted(state.microphoneMuted)
            if (state.error) setError(state.error)
          },
        })
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not join room')
      })

    return () => {
      cancelled = true
      unsubscribe?.()
      void capture.stop()
      void player.close()
    }
  }, [handleDelta, handleEvent, session])

  const participants = useMemo(() => {
    const configured = session.participants || []
    const director = configured.find((item) => item.type === 'director') || {
      id: 'director',
      name: 'Director',
      type: 'director' as const,
    }
    const cast = selectedCharacters.map((item) => {
      const metadata = configured.find(
        (participant) => participant.characterId === item.id || participant.id === item.id,
      )
      return metadata || {
        id: item.id,
        characterId: item.id,
        name: item.name,
        type: 'character' as const,
        imageUrl: item.image_url,
      }
    })
    return [
      { id: session.writerId || 'writer', name: 'You', type: 'writer' as const },
      director,
      ...cast,
    ]
  }, [selectedCharacters, session.participants, session.writerId])

  const toggleMicrophone = useCallback(async () => {
    const client = getLiveClient(session.sessionId)
    if (!client) return
    setError(null)
    try {
      if (!micMuted) {
        if (client.usesWebSocketAudioFallback) {
          await captureRef.current?.stop()
          if (activeStreamRef.current) client.sendAudioStop(activeStreamRef.current)
          activeStreamRef.current = null
        }
        await client.setMicrophoneEnabled(false)
        setMicMuted(true)
        return
      }

      playerRef.current?.stop()
      await client.startAudioPlayback()
      const provider = await client.setMicrophoneEnabled(true)
      if (provider === 'websocket_fallback') {
        const turnId = crypto.randomUUID()
        const streamId = crypto.randomUUID()
        activeStreamRef.current = streamId
        client.sendAudioStart(turnId, streamId)
        await captureRef.current?.start()
      }
      setMicMuted(false)
    } catch (reason) {
      await client.setMicrophoneEnabled(false).catch(() => undefined)
      setMicMuted(true)
      setError(reason instanceof Error ? reason.message : 'Microphone unavailable')
    }
  }, [micMuted, session.sessionId])

  const handleSend = useCallback(async (text: string) => {
    setMessages((items) => [...items, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }])
    streamMessageRef.current = null
    setIsTyping(true)
    setError(null)
    playerRef.current?.stop()
    try {
      const client = getLiveClient(session.sessionId)
      await client?.startAudioPlayback()
      const result = await sendChatTurn({
        session,
        character: chatCharacter,
        message: text,
      })
      if (session.mode === 'offline') {
        setMessages((items) => [...items, {
          id: crypto.randomUUID(),
          role: 'character',
          content: result.reply,
          characterName: result.character_name || chatCharacter.name,
          timestamp: new Date().toISOString(),
        }])
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Turn failed')
    } finally {
      streamMessageRef.current = null
      setIsTyping(false)
    }
  }, [chatCharacter, session])

  const writerSpeaking = media.activeSpeakerIds.includes(
    session.writerId || 'writer',
  )

  const toggleDiscussion = useCallback(() => {
    const client = getLiveClient(session.sessionId)
    if (!client) return
    if (discussionActive) client.stopDiscussion()
    else client.startDiscussion(selectedCharacters.map((item) => item.id))
    setDiscussionActive((active) => !active)
  }, [discussionActive, selectedCharacters, session.sessionId])

  const finishRoom = useCallback(async () => {
    const client = getLiveClient(session.sessionId)
    if (session.mode === 'live' && client) {
      setError(null)
      setExportStatus('Asking the Director to prepare a finalization proposal…')
      client.requestFinalization()
      return
    }
    setExportStatus('Creating the final story…')
    setError(null)
    try {
      let completed = artifact
      if (!completed) completed = await createStoryExport(session, story.title)
      await endSession(session)
      onFinalStory(completed)
    } catch (reason) {
      setExportStatus(null)
      setError(reason instanceof Error ? reason.message : 'Could not finalize story')
    }
  }, [artifact, onFinalStory, session, story.title])

  const respond = (decision: 'confirm' | 'revise' | 'reject') => {
    if (!proposal) return
    getLiveClient(session.sessionId)?.respondToFinalization(
      proposal.proposal_id,
      decision,
      decision === 'revise' ? revisionNotes : undefined,
    )
    setProposal(null)
    setRevisionNotes('')
    setExportStatus(decision === 'confirm' ? 'Creating the final story…' : null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#171717] text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{story.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/50">
            <span className={`h-1.5 w-1.5 rounded-full ${connection === 'open' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {connection === 'open' ? 'Live writers’ room' : connection}
            <span>
              · {media.provider === 'livekit'
                ? media.connected
                  ? 'LiveKit audio ready'
                  : 'connecting LiveKit audio'
                : media.provider === 'websocket_fallback'
                  ? 'WebSocket audio ready'
                  : 'joining audio'}
            </span>
          </p>
        </div>
        <button type="button" onClick={() => void finishRoom()} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold hover:bg-red-500">
          <PhoneOff size={15} /> End
        </button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative flex min-h-0 flex-col p-3">
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {participants.map((participant) => (
              <ParticipantTile
                key={participant.id}
                participant={participant}
                character={selectedCharacters.find(
                  (item) =>
                    item.id ===
                    ('characterId' in participant ? participant.characterId : participant.id),
                )}
                connection={connection}
                media={media}
                speaking={
                  activeAgent === participant.id ||
                  media.activeSpeakerIds.includes(participant.id)
                }
                muted={participant.type === 'writer' ? micMuted : undefined}
              />
            ))}
          </div>

          {captions.length > 0 && (
            <div className="pointer-events-none absolute inset-x-8 bottom-24 flex justify-center">
              <div className="max-w-2xl rounded-xl bg-black/80 px-5 py-3 text-center shadow-xl backdrop-blur">
                <span className="mr-2 text-xs font-bold text-emerald-400">{captions.at(-1)?.speaker}</span>
                <span className="text-sm leading-relaxed">{captions.at(-1)?.text}</span>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <ControlButton onClick={() => void toggleMicrophone()} active={!micMuted} label={micMuted ? 'Unmute' : 'Mute'} icon={micMuted ? <MicOff size={19} /> : <Mic size={19} />} />
            <select
              aria-label="Spoken language"
              value={speechLanguage}
              disabled={!micMuted}
              onChange={(event) => {
                const language = event.target.value
                speechLanguageRef.current = language
                setSpeechLanguage(language)
                window.localStorage.setItem('off-the-page:speech-language', language)
                getLiveClient(session.sessionId)?.setSpeechLanguage(
                  language === 'auto' ? null : language,
                )
              }}
              className="h-[58px] rounded-xl border border-white/10 bg-[#2b2b2b] px-3 text-xs text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
              title={micMuted ? 'Choose the language you will speak' : 'Mute before changing language'}
            >
              <option value="auto">Auto language</option>
              <option value="hi">Hindi / Hinglish</option>
              <option value="en">English</option>
              <option value="bn">Bengali</option>
              <option value="mr">Marathi</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
              <option value="pa">Punjabi</option>
              <option value="ur">Urdu</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="ar">Arabic</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
            </select>
            <ControlButton
              onClick={toggleDiscussion}
              active={discussionActive}
              disabled={selectedCharacters.length < 2}
              label={discussionActive ? 'Stop discussion' : 'Group discussion'}
              icon={discussionActive ? <CircleStop size={19} /> : <Users size={19} />}
            />
            <ControlButton onClick={() => getLiveClient(session.sessionId)?.interrupt()} label="Interrupt" icon={<Zap size={19} />} />
          </div>
          <p className={`mt-2 text-center text-[11px] ${writerSpeaking ? 'text-emerald-300' : 'text-white/50'}`}>
            {micMuted
              ? 'Microphone muted — click Unmute to speak'
              : writerSpeaking
                ? 'Voice detected — your microphone is reaching the room'
                : 'Microphone live — listening for your voice'}
          </p>
        </section>

        <aside className="min-h-[360px] border-l border-white/10 bg-[#fdfbf7] text-parchment">
          <ChatWindow
            character={chatCharacter}
            messages={messages}
            isTyping={isTyping}
            onSend={(text) => void handleSend(text)}
            disabled={connection === 'closed'}
          />
        </aside>
      </div>

      {(proposal || exportStatus || error) && (
        <div className="absolute bottom-20 left-1/2 z-20 w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#242424] p-5 shadow-2xl">
          {proposal && (
            <>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessagesSquare size={17} className="text-emerald-400" /> Ready to finalize?</div>
              <p className="text-sm leading-relaxed text-white/80">{proposal.summary}</p>
              <p className="mt-2 text-xs leading-relaxed text-white/50">{proposal.rationale}</p>
              <textarea value={revisionNotes} onChange={(event) => setRevisionNotes(event.target.value)} placeholder="Revision notes (optional until you choose Revise)" className="mt-4 min-h-20 w-full rounded-lg border border-white/15 bg-black/20 p-3 text-sm outline-none focus:border-emerald-400" />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => respond('reject')} className="rounded-lg px-3 py-2 text-xs text-white/60 hover:bg-white/10">Reject</button>
                <button type="button" onClick={() => respond('revise')} className="rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10">Revise</button>
                <button type="button" onClick={() => respond('confirm')} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400">Confirm</button>
              </div>
            </>
          )}
          {exportStatus && !proposal && <p className="text-sm text-white/80">{exportStatus}</p>}
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  )
}

function ParticipantTile({
  participant,
  character,
  connection,
  media,
  speaking,
  muted,
}: {
  participant: SessionParticipant | { id: string; name: string; type: 'writer' }
  character?: Character
  connection: ConnectionState
  media: LiveMediaState
  speaking: boolean
  muted?: boolean
}) {
  const liveParticipant = media.participants.find((item) => item.id === participant.id)
  const connected =
    connection === 'open' &&
    media.connected &&
    (participant.type !== 'writer' || liveParticipant?.connected === true)
  const isMuted = muted ?? liveParticipant?.isMuted ?? !speaking
  const imageUrl = participant.type === 'writer' ? undefined : ('imageUrl' in participant ? participant.imageUrl : undefined) || character?.image_url
  return (
    <article className={`relative flex min-h-[150px] items-center justify-center overflow-hidden rounded-xl border bg-[#242424] transition ${speaking ? 'border-emerald-400 ring-2 ring-emerald-400/25' : 'border-white/10'}`}>
      {imageUrl ? <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75" /> : (
        <div className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold ${participant.type === 'director' ? 'bg-emerald-800' : participant.type === 'writer' ? 'bg-blue-800' : 'bg-white/10'}`}>
          {initials(participant.name)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-8">
        <span className="truncate text-xs font-semibold">
          {participant.name}
          {participant.type === 'director' &&
          participant.name.toLowerCase() !== 'director'
            ? ' · Director'
            : ''}
        </span>
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} title={connected ? 'Connected' : 'Connecting'} />
          {isMuted ? <MicOff size={14} className="text-red-300" /> : speaking ? <span className="flex h-4 items-end gap-0.5">{[2, 4, 3].map((height, index) => <i key={index} className="w-0.5 animate-pulse rounded bg-emerald-400" style={{ height: `${height * 3}px` }} />)}</span> : <Mic size={14} className="text-white/45" />}
        </span>
      </div>
    </article>
  )
}

function ControlButton({ onClick, icon, label, active, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`flex min-w-24 flex-col items-center gap-1 rounded-lg px-3 py-2 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white hover:bg-white/15'}`}>
      {icon}<span>{label}</span>
    </button>
  )
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function humanize(id: string) {
  return id.replace(/^char_/, '').split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
