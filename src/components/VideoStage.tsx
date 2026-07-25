import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from 'lucide-react'
import type { Character } from '../types'

interface VideoStageProps {
  character: Character
  isLive: boolean
  isSpeaking: boolean
  videoUrl?: string | null
  storyTitle: string
  onEndCall: () => void
}

export function VideoStage({
  character,
  isLive,
  isSpeaking,
  videoUrl,
  storyTitle,
  onEndCall,
}: VideoStageProps) {
  // Removed unused color variable

  return (
    <div className="relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl bg-ink-soft">
      {/* Video / avatar stage */}
      <div className="relative flex-1 bg-ink">
        {videoUrl ? (
          <video
            key={videoUrl}
            src={videoUrl}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="relative">
              {isSpeaking && (
                <>
                  <span
                    className="absolute -inset-4 rounded-full border border-mist opacity-30"
                    style={{
                      animation: 'live-pulse 1.4s infinite',
                    }}
                  />
                </>
              )}
              <div
                className="relative flex h-32 w-32 items-center justify-center rounded-full text-4xl font-display text-parchment shadow-sm md:h-40 md:w-40 md:text-5xl"
                style={{
                  backgroundColor: 'var(--color-ink-muted)',
                }}
              >
                {initials(character.name)}
              </div>
            </div>
            <p
              className="mt-6 font-display text-2xl text-parchment md:text-3xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {character.name}
            </p>
            {character.role && (
              <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-mist">
                {character.role}
              </p>
            )}
            {!videoUrl && (
              <p className="mt-4 max-w-xs text-center text-[11px] leading-relaxed text-mist">
                Lip-sync media streams here via WebRTC /{' '}
                <code className="text-ember">agent.video.chunk</code> once the
                room orchestrator is live. Text replies work over the control plane.
              </p>
            )}
          </div>
        )}

        {/* Top chrome */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-6">
          <div className="rounded-full bg-ink-soft/90 px-4 py-2 backdrop-blur">
            <p className="text-[11px] font-medium text-parchment-dim">{storyTitle}</p>
          </div>
          {isLive && (
            <div className="flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1.5 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold tracking-wider text-green-600">
                LIVE
              </span>
            </div>
          )}
        </div>

        {/* PiP self view (decorative) */}
        <div className="absolute bottom-6 right-6 overflow-hidden rounded-xl border border-line bg-ink shadow-sm">
          <div className="flex h-24 w-32 flex-col items-center justify-center bg-ink-soft">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-parchment shadow-sm">
              You
            </div>
            <p className="mt-2 text-[9px] uppercase tracking-wider text-mist">Creator</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 bg-ink-soft/80 px-4 py-5 backdrop-blur">
        <ControlBtn icon={Mic} label="Mute" />
        <ControlBtn icon={Video} label="Camera" />
        <ControlBtn icon={Volume2} label="Audio" />
        <button
          type="button"
          onClick={onEndCall}
          className="mx-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose text-white shadow-sm transition hover:brightness-110"
          title="End call"
        >
          <PhoneOff size={18} />
        </button>
        <ControlBtn icon={MicOff} label="Off" muted />
        <ControlBtn icon={VideoOff} label="Off" muted />
      </div>
    </div>
  )
}

function ControlBtn({
  icon: Icon,
  label,
  muted,
}: {
  icon: typeof Mic
  label: string
  muted?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
        muted
          ? 'bg-transparent text-mist/40'
          : 'bg-ink text-parchment-dim hover:text-ember shadow-sm hover:shadow'
      }`}
    >
      <Icon size={18} />
    </button>
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
