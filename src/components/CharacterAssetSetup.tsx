import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ImagePlus,
  Loader2,
  Mic,
  Pause,
  Play,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import type { Character, CharacterAssetUpdate, StoryContext, Voice } from '../types'
import {
  assignCharacterVoice,
  cloneCharacterVoice,
  listVoices,
  removeCharacterImage,
  removeCharacterVoice,
  uploadCharacterImage,
} from '../api/client'

interface CharacterAssetSetupProps {
  story: StoryContext
  character: Character
  onUpdate: (update: CharacterAssetUpdate) => void
}

export function CharacterAssetSetup({
  story,
  character,
  onUpdate,
}: CharacterAssetSetupProps) {
  const imageInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const recordingStream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const previewAudio = useRef<HTMLAudioElement | null>(null)
  const [voices, setVoices] = useState<Voice[]>([])
  const [search, setSearch] = useState('')
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [cloneFiles, setCloneFiles] = useState<File[]>([])
  const [cloneName, setCloneName] = useState(`${character.name} voice`)
  const [cloneDescription, setCloneDescription] = useState('')
  const [consent, setConsent] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingVoices(true)
      listVoices(search, story)
        .then(setVoices)
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : 'Could not load voices'),
        )
        .finally(() => setLoadingVoices(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, story])

  useEffect(
    () => () => {
      previewAudio.current?.pause()
      recordingStream.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )

  async function uploadImage(file: File) {
    setBusy('image')
    setError(null)
    try {
      const imageUrl = await uploadCharacterImage(story, character.id, file)
      onUpdate({ imageUrl: imageUrl || URL.createObjectURL(file) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Image upload failed')
    } finally {
      setBusy(null)
    }
  }

  async function removeImage() {
    setBusy('image')
    setError(null)
    try {
      await removeCharacterImage(story, character.id)
      onUpdate({ imageUrl: '' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove image')
    } finally {
      setBusy(null)
    }
  }

  async function assignVoice(voice: Voice) {
    setBusy(`voice-${voice.voiceId}`)
    setError(null)
    try {
      await assignCharacterVoice(story, character.id, voice.voiceId, voice)
      onUpdate({ voiceId: voice.voiceId, voiceName: voice.name })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Voice assignment failed')
    } finally {
      setBusy(null)
    }
  }

  async function removeVoice() {
    setBusy('remove-voice')
    setError(null)
    try {
      await removeCharacterVoice(story, character.id)
      onUpdate({ voiceId: '', voiceName: '' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove voice')
    } finally {
      setBusy(null)
    }
  }

  function togglePreview(voice: Voice) {
    if (!voice.previewUrl) return
    if (playing === voice.voiceId) {
      previewAudio.current?.pause()
      setPlaying(null)
      return
    }
    previewAudio.current?.pause()
    const audio = new Audio(voice.previewUrl)
    previewAudio.current = audio
    setPlaying(voice.voiceId)
    audio.addEventListener('ended', () => setPlaying(null), { once: true })
    void audio.play().catch(() => {
      setPlaying(null)
      setError('Browser blocked voice preview playback.')
    })
  }

  async function toggleRecording() {
    if (isRecording) {
      recorder.current?.stop()
      return
    }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      recordingStream.current = stream
      recorder.current = mediaRecorder
      chunks.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data)
      }
      mediaRecorder.onstop = () => {
        const type = mediaRecorder.mimeType || 'audio/webm'
        const file = new File(chunks.current, `recording-${Date.now()}.webm`, {
          type,
        })
        setCloneFiles((current) => [...current, file])
        recordingStream.current?.getTracks().forEach((track) => track.stop())
        recordingStream.current = null
        setIsRecording(false)
      }
      mediaRecorder.start()
      setIsRecording(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Microphone unavailable')
    }
  }

  async function submitClone() {
    if (!consent || !cloneFiles.length || !cloneName.trim()) return
    setBusy('clone')
    setError(null)
    try {
      const voice = await cloneCharacterVoice({
        story,
        characterId: character.id,
        name: cloneName.trim(),
        description: cloneDescription.trim(),
        consent,
        files: cloneFiles,
      })
      if (voice) {
        onUpdate({ voiceId: voice.voiceId, voiceName: voice.name })
        setVoices((current) => [voice, ...current])
      }
      setCloneFiles([])
      setConsent(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Voice cloning failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="col-span-full min-w-0 overflow-hidden rounded-2xl border border-line bg-ink-soft p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">
          {character.id === 'director' ? 'Director setup' : 'Character assets'}
        </p>
        <h2 className="font-display text-2xl text-parchment">
          Set up {character.name}
        </h2>
      </div>

      {error && (
        <p className="mb-5 rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p>
      )}

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold text-parchment">Avatar</h3>
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-muted">
              {character.image_url ? (
                <img
                  src={character.image_url}
                  alt={`${character.name} avatar`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImagePlus className="text-mist" size={28} />
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={imageInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadImage(file)
                  event.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={busy === 'image'}
                onClick={() => imageInput.current?.click()}
                className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-medium text-parchment hover:border-ember disabled:opacity-50"
              >
                {busy === 'image' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload image
              </button>
              {character.image_url && (
                <button
                  type="button"
                  onClick={() => void removeImage()}
                  className="flex items-center gap-2 px-2 text-xs text-rose"
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-parchment">ElevenLabs voice catalog</h3>
            {character.voice_id && (
              <button
                type="button"
                onClick={() => void removeVoice()}
                className="text-xs text-rose"
              >
                Remove {character.voice_name || 'assigned voice'}
              </button>
            )}
          </div>
          <label className="mb-3 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-ink px-3 py-2">
            <Search size={15} className="text-mist" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search voices"
              className="min-w-0 w-full bg-transparent text-sm text-parchment outline-none placeholder:text-mist"
            />
            {loadingVoices && <Loader2 size={14} className="animate-spin text-ember" />}
          </label>
          <div className="custom-scroll max-h-56 space-y-1 overflow-auto">
            {voices.map((voice) => {
              const assigned = character.voice_id === voice.voiceId
              return (
                <div
                  key={voice.voiceId}
                  className="flex min-w-0 items-center gap-3 overflow-hidden rounded-lg bg-ink px-3 py-2"
                >
                  <button
                    type="button"
                    disabled={!voice.previewUrl}
                    onClick={() => togglePreview(voice)}
                    aria-label={`Preview ${voice.name}`}
                    className="rounded-full p-2 text-ember disabled:text-mist/30"
                  >
                    {playing === voice.voiceId ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-parchment">{voice.name}</p>
                    <p className="truncate text-[11px] text-mist">
                      {[voice.category, voice.description].filter(Boolean).join(' · ') || 'ElevenLabs voice'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={assigned || busy === `voice-${voice.voiceId}`}
                    onClick={() => void assignVoice(voice)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs text-parchment hover:border-ember disabled:opacity-50"
                  >
                    {assigned ? <Check size={14} /> : 'Assign'}
                  </button>
                </div>
              )
            })}
            {!loadingVoices && voices.length === 0 && (
              <p className="py-6 text-center text-xs text-mist">No voices found.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-medium text-mist">
            Voice name
            <input
              value={cloneName}
              onChange={(event) => setCloneName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-parchment outline-none focus:border-ember"
            />
          </label>
          <label className="text-xs font-medium text-mist">
            Description
            <input
              value={cloneDescription}
              onChange={(event) => setCloneDescription(event.target.value)}
              placeholder="Tone, accent, or intended use"
              className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-parchment outline-none focus:border-ember"
            />
          </label>
        </div>
        <input
          ref={audioInput}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(event) => {
            setCloneFiles((current) => [...current, ...Array.from(event.target.files || [])])
            event.target.value = ''
          }}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => audioInput.current?.click()}
            className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs text-parchment hover:border-ember"
          >
            <Upload size={14} /> Upload audio samples
          </button>
          <button
            type="button"
            onClick={() => void toggleRecording()}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs ${
              isRecording ? 'bg-rose text-white' : 'border border-line text-parchment hover:border-ember'
            }`}
          >
            <Mic size={14} /> {isRecording ? 'Stop recording' : 'Record sample'}
          </button>
          <span className="text-xs text-mist">
            {cloneFiles.length
              ? `${cloneFiles.length} sample${cloneFiles.length === 1 ? '' : 's'} ready`
              : 'Upload or record at least one sample'}
          </span>
        </div>
        {cloneFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {cloneFiles.map((file, index) => (
              <button
                type="button"
                key={`${file.name}-${index}`}
                onClick={() => setCloneFiles((files) => files.filter((_, i) => i !== index))}
                className="rounded-full bg-ink px-3 py-1 text-[11px] text-mist"
                title="Remove sample"
              >
                {file.name} ×
              </button>
            ))}
          </div>
        )}
        <label className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-mist">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 accent-[var(--color-ember)]"
          />
          <span>
            I confirm I have the explicit right and consent to clone this voice and use
            these recordings for this story.
          </span>
        </label>
        <button
          type="button"
          disabled={!consent || !cloneFiles.length || !cloneName.trim() || busy === 'clone'}
          onClick={() => void submitClone()}
          className="mt-4 flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy === 'clone' && <Loader2 size={14} className="animate-spin" />}
          Create and assign instant voice clone
        </button>
      </div>
    </section>
  )
}
