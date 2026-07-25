/**
 * Captures microphone audio as 16kHz mono 16-bit PCM.
 *
 * The backend types writer audio as `pcm_16000` at exactly 16000 Hz, so this
 * has to deliver that rate whatever the hardware does. Three things that are
 * easy to get wrong and were:
 *
 *   1. **Never connect the capture graph to `destination` audibly.** That
 *      routes the microphone to the speakers — the writer hears themselves
 *      delayed, and it feeds back into the room. A muted gain node keeps the
 *      graph pulling without emitting anything.
 *   2. **`new AudioContext({ sampleRate: 16000 })` is a request, not a
 *      guarantee.** Safari and some Android devices ignore it and run at
 *      48000. Sending 48k samples labelled as 16k makes transcription
 *      gibberish, so we read the real rate and resample.
 *   3. **`process()` fires every 128 frames.** Emitting per call is ~125
 *      WebSocket messages a second. We accumulate ~20ms chunks instead.
 */

/** Backend contract: WriterAudioStartEvent pins these. */
export const TARGET_SAMPLE_RATE = 16000
const CHUNK_MS = 20
const TARGET_SAMPLES_PER_CHUNK = (TARGET_SAMPLE_RATE * CHUNK_MS) / 1000

const WORKLET_SOURCE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    this.ratio = opts.inputRate / opts.targetRate
    this.chunkSamples = opts.chunkSamples
    this.buffer = new Float32Array(this.chunkSamples)
    this.filled = 0
    this.position = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channel = input[0]
    if (!channel) return true

    // Linear resample to the target rate. Adequate for speech recognition and
    // cheap enough to run on the audio thread.
    while (this.position < channel.length) {
      const index = Math.floor(this.position)
      const frac = this.position - index
      const a = channel[index]
      const b = index + 1 < channel.length ? channel[index + 1] : a
      this.buffer[this.filled++] = a + (b - a) * frac
      this.position += this.ratio

      if (this.filled === this.chunkSamples) {
        const pcm = new Int16Array(this.chunkSamples)
        for (let i = 0; i < this.chunkSamples; i++) {
          const s = Math.max(-1, Math.min(1, this.buffer[i]))
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        this.port.postMessage(pcm.buffer, [pcm.buffer])
        this.filled = 0
      }
    }
    this.position -= channel.length
    return true
  }
}
registerProcessor('pcm-processor', PCMProcessor)
`

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export class AudioCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private readonly onChunk: (data: ArrayBuffer) => void

  constructor(onChunk: (data: ArrayBuffer) => void) {
    this.onChunk = onChunk
  }

  get active(): boolean {
    return this.context !== null
  }

  async start(): Promise<void> {
    if (this.context) return

    const Ctor = audioContextCtor()
    if (!Ctor) throw new Error('Web Audio is unavailable in this browser')

    // echoCancellation matters more here than anywhere else: without it the
    // character's own voice is picked up and transcribed back as the writer.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    const context = new Ctor({ sampleRate: TARGET_SAMPLE_RATE })
    this.context = context
    if (context.state === 'suspended') await context.resume()

    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    try {
      await context.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }

    this.source = context.createMediaStreamSource(this.stream)
    this.worklet = new AudioWorkletNode(context, 'pcm-processor', {
      processorOptions: {
        // The real rate, not the one we asked for.
        inputRate: context.sampleRate,
        targetRate: TARGET_SAMPLE_RATE,
        chunkSamples: TARGET_SAMPLES_PER_CHUNK,
      },
    })
    this.worklet.port.onmessage = (event) => {
      this.onChunk(event.data as ArrayBuffer)
    }

    // Muted sink. Some engines will not pull from a node with no downstream
    // connection, but connecting to `destination` at any audible gain sends
    // the microphone straight to the speakers.
    this.sink = context.createGain()
    this.sink.gain.value = 0
    this.source.connect(this.worklet)
    this.worklet.connect(this.sink)
    this.sink.connect(context.destination)
  }

  async stop(): Promise<void> {
    if (this.worklet) {
      this.worklet.port.onmessage = null
      this.worklet.disconnect()
      this.worklet = null
    }
    if (this.sink) {
      this.sink.disconnect()
      this.sink = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
    const context = this.context
    this.context = null
    if (context) {
      try {
        await context.close()
      } catch {
        /* already closed */
      }
    }
  }
}
