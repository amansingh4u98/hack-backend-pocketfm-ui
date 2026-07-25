# Off the Page (UI)

> Full project briefing: [docs/PROJECT_BRIEFING.md](docs/PROJECT_BRIEFING.md)

Creator studio for the Pocket FM × OpenAI Hackathon. Upload a story, pick a
character, talk to them in a call UI.

Pairs with backend: [`hack-backend-pocketfm`](../hack-backend-pocketfm).

## Quick start

```bash
cd off-the-page
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Works **offline** with stub cast + demo replies if the API is unreachable.

## Backend integration (current)

Vite proxies `/api/*` (and WebSockets) → `http://localhost:8000/*`.

| Step | Method | Path |
|------|--------|------|
| Health | `GET` | `/health` |
| Extract story | `POST` | `/actor-context/extract` |
| Start call | `POST` | `/v1/studio/start-session` |
| Live chat | `WS` | `/v1/rooms/{room_id}/sessions/{session_id}/live?token=…` |

### 1. Extract

```json
POST /actor-context/extract
{
  "text": "…",
  "title": "optional",
  "enable_web_search": true,
  "enable_gap_fill": true
}
```

Returns full `StoryExtraction` → UI maps `characters[]` to cast cards.

### 2. Start session (studio bridge)

```json
POST /v1/studio/start-session
{
  "extraction": { /* full StoryExtraction */ },
  "character_ids": ["char_…"],
  "writer_id": "ui-writer"
}
```

Returns `room_id`, `session_id`, `live_token`.

Backend needs:

- MongoDB
- `LIVE_TOKEN_SECRET` (≥32 chars)
- OpenAI keys for extraction (on backend)
- Optional `DIRECTOR_VOICE_ID` / `VITE_DEFAULT_VOICE_ID` for TTS voices

### 3. Live WebSocket

```text
ws://…/v1/rooms/{room_id}/sessions/{session_id}/live?token={live_token}
```

Client JSON events:

- `user.transcript.submit` — `{ turn_id, stream_id, text }`
- `session.leave`
- `ping`

Server events used by UI:

- `session.joined`
- `speaker.selected`
- `agent.text.delta` / `agent.text.completed` / `agent.turn.completed`

## Env

```bash
# optional absolute API (skips /api proxy)
# VITE_API_BASE_URL=http://localhost:8000

# identity on studio sessions
# VITE_WRITER_ID=ui-writer

# optional ElevenLabs voice id applied to all cast members
# VITE_DEFAULT_VOICE_ID=
```

## Stack

- Vite + React + TypeScript + Tailwind v4  
- Client PDF (`pdfjs-dist`) / DOC (`mammoth`) text extraction  
- Optional browser speech-to-text in chat  

## Project layout

```
src/
  api/client.ts              # actor-context + studio + live WS
  lib/parseStory.ts
  lib/buildStubExtraction.ts
  lib/mapExtraction.ts
  types/index.ts
  components/
```
