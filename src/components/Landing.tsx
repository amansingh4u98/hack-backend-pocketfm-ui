import { BookOpen, Mic, Sparkles, Video } from 'lucide-react'
import { BackendStatus } from './BackendStatus'

interface LandingProps {
  onStart: () => void
}

const features = [
  {
    icon: BookOpen,
    title: 'Bring the page',
    body: 'Paste your draft or upload PDF / DOC. We load the full story as context.',
  },
  {
    icon: Sparkles,
    title: 'Pick a character',
    body: 'They only know what the story says they know — voice, secrets, blind spots.',
  },
  {
    icon: Video,
    title: 'Go live on video',
    body: 'Real-time lip-synced video. Interview them. Stress-test motivations.',
  },
  {
    icon: Mic,
    title: 'Catch what doesn’t add up',
    body: 'Hear when a beat feels false. Fill backstory. React to unwritten scenes.',
  },
]

export function Landing({ onStart }: LandingProps) {
  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-ember/10 blur-3xl" />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Brand />
        <div className="flex items-center gap-3">
          <BackendStatus />
          <button
            type="button"
            onClick={onStart}
            className="rounded-full border border-line bg-ink-soft/80 px-4 py-2 text-sm text-parchment-dim transition hover:border-ember/40 hover:text-parchment"
          >
            Open studio
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 md:pt-16">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Copilot for storytellers
          </p>
          <h1
            className="font-display text-5xl leading-[1.1] tracking-tight text-parchment md:text-7xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Get on a live call
            <br />
            <span className="italic text-parchment-dim">
              with your characters
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-xl text-base leading-loose text-mist md:text-lg" style={{ fontFamily: 'var(--font-display)' }}>
            Writers already interview their characters on paper. Off the Page
            makes it real — upload your story, pick a character, and talk to them
            face-to-face in seconds.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={onStart}
              className="group rounded-full bg-parchment px-8 py-3.5 text-sm font-medium text-ink transition hover:bg-parchment-dim"
            >
              Bring a story to life
            </button>
            <a
              href="#how"
              className="rounded-full px-6 py-3.5 text-sm font-medium text-parchment transition hover:text-ember hover:underline underline-offset-4"
            >
              How it works
            </a>
          </div>
        </div>

        {/* Preview card */}
        <div className="animate-fade-up mx-auto mt-20 max-w-4xl" style={{ animationDelay: '0.12s' }}>
          <div className="overflow-hidden rounded-2xl bg-ink-soft shadow-sm">
            <div className="flex items-center gap-2 bg-ink-muted/50 px-6 py-4">
              <span className="ml-1 text-xs font-medium uppercase tracking-widest text-mist">Live Session</span>
            </div>
            <div className="grid md:grid-cols-[1fr_1.2fr]">
              <div className="relative flex min-h-[300px] flex-col items-center justify-center bg-ink-muted p-8">
                <div className="relative mb-6">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-ink text-3xl font-display text-parchment-dim shadow-sm">
                    M
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-display text-2xl text-parchment">Mira Voss</p>
                  <p className="mt-2 text-xs uppercase tracking-widest text-mist">Protagonist</p>
                </div>
              </div>
              <div className="flex flex-col gap-6 p-8 md:border-l border-line/50">
                <div className="flex flex-col gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-mist">You</span>
                    <p className="mt-1 font-display text-lg text-parchment-dim">Why did you hide the letter from Elias?</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ember">Mira Voss</span>
                    <p className="mt-1 font-display text-xl italic text-parchment leading-relaxed">Because if he knew, he wouldn't have boarded that train. And I needed him gone.</p>
                  </div>
                </div>
                <div className="mt-auto pt-6 text-xs text-mist/70 italic">
                  Dialogue remains bound by your story context.
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="how" className="mt-32">
          <h2
            className="mb-16 text-center font-display text-4xl text-parchment md:text-5xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            From draft to dialogue
          </h2>
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="animate-fade-up text-center"
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-ink-soft text-ember">
                  <f.icon size={20} strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 font-display text-xl text-parchment">{f.title}</h3>
                <p className="text-sm leading-loose text-mist">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-mist">
        Off the Page · Pocket FM × OpenAI Hackathon
      </footer>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-parchment text-sm font-bold text-ink">
        O
      </div>
      <div>
        <div className="text-sm font-semibold tracking-wide text-parchment">
          Off the Page
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-mist">
          Character copilot
        </div>
      </div>
    </div>
  )
}



export { Brand }
