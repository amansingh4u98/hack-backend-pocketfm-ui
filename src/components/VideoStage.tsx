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
  const color = character.avatar_color || '#e8a45a'

  return (
    <div className="relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border border-line bg-ink-muted">
      {/* Video / avatar stage */}
      <div className="relative flex-1 bg-gradient-to-b from-[#1a1410] via-ink to-[#0e0c0b]">
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl"
          style={{ backgroundColor: color }}
        />

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
                    className="absolute inset-0 animate-ping rounded-full opacity-20"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="absolute -inset-3 rounded-full opacity-25"
                    style={{
                      backgroundColor: color,
                      animation: 'live-pulse 1.4s infinite',
                    }}
                  />
                </>
              )}
              <div
                className="relative flex h-32 w-32 items-center justify-center rounded-full text-4xl font-semibold text-ink shadow-2xl md:h-40 md:w-40 md:text-5xl"
                style={{
                  backgroundColor: color,
                  boxShadow: isSpeaking
                    ? `0 0 60px -10px ${color}`
                    : undefined,
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
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-mist">
                {character.role}
              </p>
            )}
            {!videoUrl && (
              <p className="mt-4 max-w-xs text-center text-[11px] leading-relaxed text-mist/70">
                Lip-sync media streams here via WebRTC /{' '}
                <code className="text-ember/80">agent.video.chunk</code> once the
                room orchestrator is live. Text replies work over the control plane.
              </p>
            )}
          </div>
        )}

        {/* Top chrome */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur">
            <p className="text-[11px] text-parchment/90">{storyTitle}</p>
          </div>
          {isLive && (
            <div className="flex items-center gap-1.5 rounded-full border border-green-400/20 bg-black/40 px-2.5 py-1 backdrop-blur">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-green-400" />
              <span className="text-[10px] font-semibold tracking-wider text-green-400">
                LIVE
              </span>
            </div>
          )}
        </div>

        {/* PiP self view (decorative) */}
        <div className="absolute bottom-20 right-4 overflow-hidden rounded-xl border border-white/10 bg-ink shadow-lg">
          <div className="flex h-20 w-28 flex-col items-center justify-center bg-ink-muted">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-parchment/10 text-[10px] text-parchment">
              You
            </div>
            <p className="mt-1 text-[9px] text-mist">Creator</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 border-t border-line bg-ink-soft/90 px-4 py-4">
        <ControlBtn icon={Mic} label="Mute" />
        <ControlBtn icon={Video} label="Camera" />
        <ControlBtn icon={Volume2} label="Audio" />
        <button
          type="button"
          onClick={onEndCall}
          className="mx-1 flex h-12 w-12 items-center justify-center rounded-full bg-rose text-white shadow-lg shadow-rose/30 transition hover:brightness-110"
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
      className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
        muted
          ? 'border-line/50 text-mist/40'
          : 'border-line bg-ink-muted text-parchment-dim hover:border-ember/30 hover:text-parchment'
      }`}
    >
      <Icon size={16} />
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
