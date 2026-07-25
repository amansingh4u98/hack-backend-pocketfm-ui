# Off the Page — UI Project Briefing

**Repository:** `hack-backend-pocketfm-ui`  
**Product name:** Off the Page  
**Event:** Pocket FM × OpenAI Hackathon  
**Role of this repo:** Creator-facing web UI only  
**Companion backend:** [`hack-backend-pocketfm`](https://github.com/abhishek-flona/hack-backend-pocketfm)

---

## 1. One-liner

**Off the Page** is a copilot for storytellers. Upload or paste a story, pick a character, and talk to them in a live call UI so you can develop voice, motivations, and catch what doesn’t add up—while the character stays **story-bound** (they only know what the story says they know).

---

## 2. Problem and solution

### Problem

Writers already interview their characters on paper (answer as the character to find voice and motives). On paper that process is:

- Slow and one-sided  
- Awkward (talking to yourself)  
- Easy to “cheat”—you already know the whole plot, so the character never truly contradicts you or exposes plot holes  

For long-running audio series (Pocket FM), inconsistent character knowledge and flat voices hurt quality and production speed.

### Solution (product)

1. Bring story context (paste text or upload PDF / DOC / TXT)  
2. Extract cast + story intelligence  
3. Pick a character  
4. Open a live room (chat + video stage for lip-sync / TTS media)  
5. Interview them; answers are grounded in extracted canon and scoped knowledge on the backend  

### Solution (this UI)

This app is the **creator studio surface**:

- Cinematic, dark “writers’ room” UX  
- File + paste ingest  
- Cast picker  
- Call room with chat composer (and optional browser speech-to-text)  
- Video stage placeholder for live lip-sync / agent audio  
- Wired to FastAPI routes for extract → session → live WebSocket  

---

## 3. User flow

```text
Landing
   → Story upload (paste or PDF/DOC/TXT)
   → POST /actor-context/extract
   → Character select (cast cards from extraction)
   → POST /v1/studio/start-session  → room_id, session_id, live_token
   → Call room
        → WS …/live?token=…
        → user.transcript.submit
        → agent.text.delta / agent.text.completed
   → End call (session.leave)
```

### Offline demo mode

If the backend is down or keys are missing, the UI still works with:

- Local heuristic cast extraction  
- Stub `StoryExtraction` JSON  
- Local demo chat replies  

So pitch demos are never fully blocked by API availability.

---

## 4. Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Icons | lucide-react |
| PDF text | pdfjs-dist (client-side) |
| DOC/DOCX text | mammoth (client-side) |
| Markdown | react-markdown (available; chat is plain text today) |
| API | `fetch` + native `WebSocket` |
| Dev proxy | Vite `/api` → `http://localhost:8000` (HTTP + WS) |

**No API keys live in the frontend.** The browser only talks to the backend. Secrets (`OPENAI_API_KEY`, `LIVE_TOKEN_SECRET`, etc.) stay on the FastAPI service.

---

## 5. Repository layout

```text
off-the-page / (this repo root)
├── docs/
│   └── PROJECT_BRIEFING.md     ← this document
├── public/
│   └── favicon.svg
├── src/
│   ├── api/
│   │   └── client.ts           # extract, studio start-session, live WS
│   ├── components/
│   │   ├── Landing.tsx
│   │   ├── StoryUpload.tsx
│   │   ├── CharacterSelect.tsx
│   │   ├── CallRoom.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── VideoStage.tsx
│   │   └── BackendStatus.tsx   # GET /health badge
│   ├── lib/
│   │   ├── parseStory.ts       # PDF/DOC/TXT → text + local cast heuristic
│   │   ├── buildStubExtraction.ts
│   │   └── mapExtraction.ts    # extraction → UI Character cards
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env.example
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

---

## 6. Backend integration contract

Base URL in dev: empty → requests go to `/api/...` and Vite rewrites to port **8000**.

| Step | Method | Path | Purpose |
|------|--------|------|---------|
| Health | `GET` | `/health` | Process liveness (UI badge) |
| Ready | `GET` | `/ready` | Readiness probe |
| Extract | `POST` | `/actor-context/extract` | Story text → `StoryExtraction` |
| Extract file | `POST` | `/actor-context/extract/upload` | Multipart upload (available; UI currently parses files client-side then uses JSON extract) |
| Start call | `POST` | `/v1/studio/start-session` | Bootstrap room + mint `live_token` |
| Live | `WS` | `/v1/rooms/{room_id}/sessions/{session_id}/live?token=` | Control plane + media frames |

### Extract request

```json
{
  "text": "full manuscript or scene…",
  "title": "optional",
  "enable_web_search": true,
  "enable_gap_fill": true
}
```

### Extract response (summary)

`StoryExtraction` per backend `STORY_EXTRACTION_SPEC`:

- `schema_version`  
- `extraction_id`  
- `story` (title, logline, synopsis, plot, …)  
- `characters[]` (id, name, role, personality, motivation, voice, secrets, …)  
- `extraction_metadata`  

### Start session request

```json
{
  "extraction": { /* full StoryExtraction */ },
  "character_ids": ["char_…"],
  "writer_id": "ui-writer",
  "voice_ids": { "char_…": "optional_elevenlabs_voice_id" }
}
```

### Start session response

```json
{
  "extraction_id": "…",
  "story_id": "…",
  "room_id": "uuid",
  "session_id": "uuid",
  "character_ids": ["…"],
  "live_token": "jwt…",
  "created": true,
  "writer_id": "ui-writer"
}
```

### Live WebSocket client events

Protocol `schema_version: "1.0"` — field name is **`type`** (not `event_type`).

| Type | Purpose |
|------|---------|
| `user.transcript.submit` | Writer text turn (`turn_id`, `stream_id`, `text`) |
| `session.leave` | Leave room |
| `ping` | Keepalive |

### Live WebSocket server events (used by UI)

| Type | Purpose |
|------|---------|
| `session.joined` | Connection accepted |
| `speaker.selected` | Who speaks next |
| `agent.text.delta` | Streaming text |
| `agent.text.completed` / `agent.turn.completed` | Turn finished |
| `error` / `agent.turn.failed` | Errors |

Binary frames may carry `agent.audio.chunk` (header + PCM); the text UI ignores binary for now and uses the video stage as a visual presence.

---

## 7. Environment variables

### Frontend (this repo)

Copy `.env.example` → `.env` only if needed. **Never commit `.env`.**

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | No | Absolute API base; empty uses `/api` proxy |
| `VITE_WRITER_ID` | No | Writer id for studio sessions (default `ui-writer`) |
| `VITE_DEFAULT_VOICE_ID` | No | Optional ElevenLabs voice applied to cast |
| `VITE_API_PROXY_TARGET` | No | Proxy target (default `http://localhost:8000`) |

### Backend (companion repo — not in this package)

Must be configured for full live demos:

- `OPENAI_API_KEY` / model for extraction  
- `LIVE_TOKEN_SECRET` (≥32 chars) for studio + WS  
- MongoDB URI  
- Optional ElevenLabs + director voice for spoken agents  

---

## 8. Local development

```bash
# Terminal 1 — backend (companion repo)
cd hack-backend-pocketfm
# configure .env (LIVE_TOKEN_SECRET, OPENAI_*, Mongo, …)
uvicorn app.main:app --reload --port 8000

# Terminal 2 — UI
cd hack-backend-pocketfm-ui   # this repo
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
npm run build    # production build
npm run preview  # preview build
```

---

## 9. Screens and UX notes

### Landing

- Product pitch and preview mock  
- **API live / offline** badge via `GET /health`  

### Story upload

- Title field  
- Drag-and-drop or browse PDF / DOC / DOCX / TXT / MD  
- Large paste editor  
- Client-side text extraction before API call  
- Calls `POST /actor-context/extract`  

### Character select

- Cards mapped from extraction: role, importance, aliases, personality, motivation, secret count  
- Start call → `POST /v1/studio/start-session` for the selected character  

### Call room

- **Video stage:** avatar pulse / optional video URL; ready for lip-sync media  
- **Chat window:** messages, typing indicator, Enter to send, optional mic (browser STT)  
- Live mode uses WebSocket; offline mode uses local replies  

---

## 10. Design system (brief)

- Background: near-black ink (`#0c0a09`) with warm ember gradients  
- Accents: ember gold (`#e8a45a`), rose  
- Type: Cormorant Garamond (display) + DM Sans (body)  
- Feel: literary / premium studio, not generic chatbot  

---

## 11. Security and secrets policy

1. **No secrets in this repository.** Only `.env.example` with empty placeholders.  
2. **No `LIVE_TOKEN_SECRET` or API keys in Vite env for production.** Tokens are minted by the backend studio route.  
3. **Do not commit** `node_modules/`, `dist/`, `.env`, OS junk.  
4. Story text is user content—treat as sensitive in real deployments (HTTPS, auth, retention).  
5. Webhook-style extraction bootstrap (`/v1/integrations/extractions/bootstrap`) is **server-to-server**; the UI uses `/v1/studio/start-session` instead.  

---

## 12. Pitch framing (for demos)

**Useful, not just cool**

- Job: interview characters to develop voice and catch continuity issues  
- Differentiator: **canon-scoped** knowledge, not unconstrained roleplay  
- Pocket FM fit: faster pre-production and stronger series characters  

**Demo script tip**

Ask a hard question (motivation, unwritten scene, or knowledge the character *shouldn’t* have) rather than “Who are you?”

---

## 13. Known limitations / roadmap

| Today | Later |
|-------|--------|
| Text-first live path | Full mic → STT → agent → TTS/lip-sync AV |
| Video stage is visual + optional URL | WebRTC media plane |
| Single-character focus per call | Multi-actor room + director chips |
| Client-side file parse then JSON extract | Optional direct `extract/upload` |
| Offline stubs | Always-on backend |

---

## 14. Related documentation

- This repo: `README.md` (quick start + API table)  
- Backend: `docs/STORY_EXTRACTION_SPEC.md`, `docs/IMPLEMENTATION_PLAN.md`, backend `README.md`  
- Hackathon problem space: Pocket FM AI Native Storytelling / AI Characters / Creator Superpowers  

---

## 15. Maintainer notes

- UI-only track: prefer changes in `src/api/client.ts` and types when backend contracts move  
- Keep offline fallbacks so demos never hard-fail  
- Prefer small, reviewable PRs  
- After pulling backend changes, re-check OpenAPI at `http://localhost:8000/docs`  

---

*Last updated for the extract + studio + live WebSocket integration against `hack-backend-pocketfm`.*
