/**
 * Captures microphone audio and converts it to 16kHz 16-bit PCM for the backend.
 */
export class AudioCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private readonly onChunk: (data: ArrayBuffer) => void

  constructor(onChunk: (data: ArrayBuffer) => void) {
    this.onChunk = onChunk
  }

  async start(): Promise<void> {
    if (this.context) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    this.context = new AudioContext({ sampleRate: 16000 })
    this.source = this.context.createMediaStreamSource(this.stream)

    // Inline AudioWorklet for Float32 -> Int16 PCM conversion
    const workletCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0]
          if (input && input.length > 0) {
            const channel = input[0]
            const buffer = new Int16Array(channel.length)
            for (let i = 0; i < channel.length; i++) {
              let s = Math.max(-1, Math.min(1, channel[i]))
              buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
            }
            this.port.postMessage(buffer.buffer, [buffer.buffer])
          }
          return true
        }
      }
      registerProcessor('pcm-processor', PCMProcessor)
    `
    const blob = new Blob([workletCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)

    await this.context.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    this.worklet = new AudioWorkletNode(this.context, 'pcm-processor')
    this.worklet.port.onmessage = (e) => {
      this.onChunk(e.data as ArrayBuffer)
    }

    this.source.connect(this.worklet)
    this.worklet.connect(this.context.destination)
  }

  async stop(): Promise<void> {
    if (this.worklet) {
      this.worklet.disconnect()
      this.worklet = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.context) {
      await this.context.close()
      this.context = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
  }
}
