import type { AudioFrame } from './liveSession'

/**
 * Plays streamed PCM frames from the live room.
 *
 * Three things make this harder than "decode and play":
 *
 *   1. **Browsers block audio until a user gesture.** The context starts
 *      suspended; `resume()` must be called from a click. `unlock()` exists
 *      for that, and playback silently does nothing until it happens.
 *   2. **Chunks arrive jittered.** Playing each one on arrival stutters on
 *      conference wifi. We schedule against a monotonically advancing cursor
 *      and hold a small lead so late frames still land in order.
 *   3. **Barge-in must be instant.** When the writer interrupts, everything
 *      already queued has to stop — otherwise the character keeps talking
 *      over them for the length of the buffer.
 */

const JITTER_BUFFER_SECONDS = 0.2
/** Beyond this the stream has stalled; restart the cursor rather than drift. */
const MAX_DRIFT_SECONDS = 1.0

type AudioContextCtor = typeof AudioContext

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** `pcm_24000` → 24000. Falls back to the frame's declared rate. */
export function sampleRateOf(frame: AudioFrame): number {
  if (frame.sampleRateHz > 0) return frame.sampleRateHz
  const match = /(\d+)/.exec(frame.codec)
  return match ? Number(match[1]) : 24000
}

/** Signed 16-bit little-endian PCM → Float32 in [-1, 1). */
export function pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
  const samples = new Int16Array(buffer)
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = samples[i] / 32768
  }
  return out
}

export interface PlaybackHandlers {
  /** Fires when audio actually starts and when the queue drains. */
  onSpeakingChange?: (speaking: boolean) => void
}

export class AudioPlayer {
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private cursor = 0
  private sources = new Set<AudioBufferSourceNode>()
  private speaking = false
  private readonly handlers: PlaybackHandlers

  constructor(handlers: PlaybackHandlers = {}) {
    this.handlers = handlers
  }

  get unlocked(): boolean {
    return this.context !== null && this.context.state === 'running'
  }

  /**
   * Must be called from a user gesture. Safe to call repeatedly.
   */
  async unlock(): Promise<boolean> {
    const Ctor = audioContextCtor()
    if (!Ctor) return false
    if (!this.context) {
      this.context = new Ctor()
      this.gain = this.context.createGain()
      this.gain.connect(this.context.destination)
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume()
      } catch {
        return false
      }
    }
    return this.context.state === 'running'
  }

  play(frame: AudioFrame): void {
    if (!frame.codec.startsWith('pcm_')) {
      // The publisher rejects non-PCM before it reaches us; if that ever
      // changes, drop the frame rather than emitting noise.
      return
    }
    const context = this.context
    const gain = this.gain
    if (!context || !gain || context.state !== 'running') return
    if (frame.data.byteLength < 2) return

    const rate = sampleRateOf(frame)
    const channels = Math.max(1, frame.channels)
    const samples = pcm16ToFloat32(frame.data)
    const perChannel = Math.floor(samples.length / channels)
    if (perChannel === 0) return

    const buffer = context.createBuffer(channels, perChannel, rate)
    for (let channel = 0; channel < channels; channel += 1) {
      const target = buffer.getChannelData(channel)
      for (let i = 0; i < perChannel; i += 1) {
        target[i] = samples[i * channels + channel]
      }
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(gain)

    const now = context.currentTime
    // Restart the cursor if we have fallen behind (first frame, or a stall).
    if (this.cursor < now || this.cursor - now > MAX_DRIFT_SECONDS) {
      this.cursor = now + JITTER_BUFFER_SECONDS
    }
    source.start(this.cursor)
    this.cursor += buffer.duration

    this.sources.add(source)
    this.setSpeaking(true)
    source.onended = () => {
      this.sources.delete(source)
      if (this.sources.size === 0) this.setSpeaking(false)
    }
  }

  /** Barge-in: drop everything queued, immediately. */
  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        /* already finished */
      }
    }
    this.sources.clear()
    this.cursor = this.context?.currentTime ?? 0
    this.setSpeaking(false)
  }

  setVolume(value: number): void {
    if (this.gain) this.gain.gain.value = Math.min(1, Math.max(0, value))
  }

  async close(): Promise<void> {
    this.stop()
    const context = this.context
    this.context = null
    this.gain = null
    if (context) {
      try {
        await context.close()
      } catch {
        /* already closed */
      }
    }
  }

  private setSpeaking(next: boolean): void {
    if (this.speaking === next) return
    this.speaking = next
    this.handlers.onSpeakingChange?.(next)
  }
}
