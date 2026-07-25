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
          <p className="mb-4 inline-flex items-center gap-2 rounded-sm border border-line bg-ink-soft px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-mist">
            Copilot for storytellers
          </p>
          <h1
            className="font-display text-5xl leading-[1.05] tracking-tight text-parchment md:text-7xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Get on a live call
            <br />
            <span className="text-ember">
              with your characters
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-parchment-dim md:text-lg">
            Writers already interview their characters on paper. Off the Page
            makes it real — upload your story, pick a character, and talk to them
            face-to-face in seconds.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStart}
              className="group rounded-md bg-ember px-7 py-3.5 text-sm font-medium text-ink shadow-sm transition hover:bg-ember-bright"
            >
              Bring a story to life
              <span className="ml-2 inline-block transition group-hover:translate-x-0.5">
                →
              </span>
            </button>
            <a
              href="#how"
              className="rounded-md border border-line px-6 py-3.5 text-sm font-medium text-parchment transition hover:bg-ink-soft hover:text-parchment"
            >
              How it works
            </a>
          </div>
        </div>

        {/* Preview card */}
        <div className="animate-fade-up mx-auto mt-16 max-w-4xl" style={{ animationDelay: '0.12s' }}>
          <div className="overflow-hidden rounded-md border border-line bg-ink shadow-lg shadow-black/5">
            <div className="flex items-center gap-2 border-b border-line bg-ink-soft px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-ember/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              <span className="ml-3 font-mono text-[10px] uppercase tracking-wider text-mist">Studio · Session Active</span>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                LIVE
              </span>
            </div>
            <div className="grid md:grid-cols-[1.2fr_1fr]">
              <div className="relative flex min-h-[240px] items-end bg-ink-muted p-6">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-28 w-28 items-center justify-center rounded-sm border border-line bg-ink text-4xl font-display text-parchment-dim shadow-sm">
                    M
                  </div>
                </div>
                <div className="relative z-10">
                  <p className="text-xs font-semibold uppercase tracking-widest text-ember">On call</p>
                  <p className="font-display text-2xl text-parchment">Mira Voss</p>
                  <p className="mt-1 font-display text-lg italic text-parchment-dim">“I never told him about the letter…”</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-line p-4 md:border-l md:border-t-0">
                <Bubble who="you" text="Why did you hide the letter from Elias?" />
                <Bubble
                  who="them"
                  text="Because if he knew, he wouldn't have boarded that train. And I needed him gone."
                />
                <div className="mt-auto rounded-sm border border-dashed border-line bg-ink-soft px-3 py-2 text-center text-[11px] font-medium text-mist">
                  Type or speak · character stays in-world
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="how" className="mt-24">
          <h2
            className="mb-10 text-center font-display text-3xl text-parchment md:text-4xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            From draft to dialogue
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="animate-fade-up rounded-md border border-line bg-ink-soft p-5 transition hover:border-mist/40"
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm border border-line bg-ink text-ember">
                  <f.icon size={18} strokeWidth={1.5} />
                </div>
                <h3 className="mb-2 text-sm font-medium text-parchment">{f.title}</h3>
                <p className="text-sm leading-relaxed text-mist">{f.body}</p>
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

function Bubble({ who, text }: { who: 'you' | 'them'; text: string }) {
  const mine = who === 'you'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-sm border px-3 py-2 text-xs leading-relaxed ${
          mine
            ? 'border-ember/30 bg-ink-soft text-parchment'
            : 'border-line bg-ink text-parchment-dim'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

export { Brand }
