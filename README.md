# Guru

An AI teaching system that lets you upload your own study materials and learn with a tutor that adapts to you — tracking what you know, building a personal knowledge base, and teaching you the way you learn best.

---

## What it does

- **Upload your materials** — PDF, DOCX, PPTX. Guru parses them with structure-aware chunking (Docling) and indexes them for retrieval.
- **Chat with your tutor** — Grounded RAG chat that only answers from your uploaded material. Adapts to your learning profile.
- **Generate lessons** — Structured lessons on any topic from your material, calibrated to your background and goals.
- **Take quizzes** — Mixed MCQ and short-answer quizzes. Short answers are graded by the LLM with feedback.
- **Track mastery** — Concept-level mastery scores update after every quiz and feed back into how Guru teaches you.
- **Wiki** — Your personal knowledge base, populated from mastery scores across all materials.
- **Sessions** — Full history of past study sessions with transcripts and the ability to resume.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React + Vite + Tailwind CSS v4 |
| Backend | FastAPI, Python 3.13, uv |
| Database | Postgres + pgvector (Docker) |
| Object storage | MinIO (Docker) |
| Document parsing | Docling (IBM) |
| Embeddings | nomic-embed-text via Ollama |
| LLM (dev) | Ollama — gemma3:12b-it-qat (SMART), phi3:mini (FAST) |
| LLM (prod) | OpenRouter or direct provider via OpenAI-compatible client |

---

## Prerequisites

- Docker + Docker Compose
- Python 3.13 + [uv](https://github.com/astral-sh/uv)
- Node.js 18+
- [Ollama](https://ollama.ai) with the following models pulled:

```bash
ollama pull gemma3:12b-it-qat   # or any capable instruction model
ollama pull phi3:mini            # fast model for cheap ops
ollama pull nomic-embed-text     # embeddings
```

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd guru
make install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
DATABASE_URL=postgresql://guru:guru123@localhost:5433/guru_db
OPENROUTER_API_KEY=sk-or-v1-...     # only needed if using OpenRouter instead of Ollama
LLM_SMART=gemma3:12b-it-qat
LLM_FAST=phi3:mini
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=guru_minio
MINIO_SECRET_KEY=minio_secret
MINIO_BUCKET=guru-materials
JWT_SECRET=your-very-long-random-secret-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080
VOYAGE_API_KEY=pa-...               # only needed if using Voyage embeddings instead of Ollama
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

### 3. Start the database and storage

```bash
make db-up
```

### 4. Run migrations

```bash
make migrate
```

### 5. Start the app

In two separate terminals:

```bash
make backend    # terminal 1 — FastAPI on :8000
make frontend   # terminal 2 — Vite on :5173
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Make commands

```text
make db-up       Start Postgres + MinIO
make db-down     Stop Postgres + MinIO
make backend     Start FastAPI dev server (hot reload)
make frontend    Start Vite dev server
make migrate     Run all SQL migrations
make shell-db    Open psql shell
make clean-db    Wipe materials, chunks, sessions (keeps users)
make install     Install all dependencies (backend + frontend)
make logs        Tail Docker logs
```

---

## Project structure

```text
guru/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── auth.py              # JWT auth utilities
│   │   ├── config.py            # Pydantic settings
│   │   ├── db.py                # asyncpg connection pool
│   │   ├── routers/             # HTTP endpoints
│   │   │   ├── auth.py          # /auth/register, /auth/login
│   │   │   ├── materials.py     # /materials upload + list
│   │   │   ├── chat.py          # /chat/message, /chat/sessions
│   │   │   ├── lessons.py       # /lesson/generate, /lesson/checklist
│   │   │   ├── quiz.py          # /quiz/generate, /quiz/submit
│   │   │   └── profile.py       # /profile onboarding + mastery + wiki
│   │   ├── services/
│   │   │   ├── ingestion.py     # Docling → chunk → embed → store
│   │   │   ├── retrieval.py     # pgvector similarity search + context builder
│   │   │   ├── llm.py           # OpenAI-compatible client (Ollama / OpenRouter)
│   │   │   ├── embedding.py     # nomic-embed-text via Ollama
│   │   │   ├── storage.py       # MinIO via boto3
│   │   │   ├── grading.py       # Quiz grading (MCQ + LLM short answer)
│   │   │   └── mastery.py       # Weighted mastery score updates
│   │   └── prompts/             # System prompt builders
│   ├── migrations/              # Raw SQL migration files
│   └── migrate.py               # Migration runner
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LandingPage.jsx
│       │   ├── LoginPage.jsx
│       │   ├── OnboardingPage.jsx
│       │   ├── LibraryPage.jsx
│       │   ├── SessionsPage.jsx
│       │   ├── WikiPage.jsx
│       │   └── StudyPage.jsx    # Three-panel study interface
│       ├── components/
│       │   └── AppLayout.jsx    # Sidebar + layout wrapper
│       └── api/
│           └── client.ts        # Typed API client
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## Switching LLM providers

The LLM client uses the OpenAI-compatible API format. To switch providers, update two values in `backend/app/services/llm.py`:

```python
# Ollama (local, free, default)
client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama",
)

# OpenRouter (free tier available)
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key,
)

# Anthropic (via OpenAI-compatible endpoint)
client = AsyncOpenAI(
    base_url="https://api.anthropic.com/v1",
    api_key=settings.anthropic_api_key,
)
```

Update `LLM_SMART` and `LLM_FAST` in `.env` to match the model names for your chosen provider.

---

## Known limitations (V0.1)

- **Large documents are slow** — ingestion calls the LLM once per chunk for contextual enrichment. A 3.6MB document with 50+ chunks can take 10+ minutes on a local model. Workaround: use a faster model for `LLM_FAST`, or increase `MAX_CHUNK_TOKENS` in `ingestion.py` to produce fewer chunks.
- **Free tier rate limits** — if using OpenRouter free models, ingestion will hit rate limits on large documents. The retry logic handles this but adds significant time.
- **No video/audio ingestion** — text documents only in V0.
- **Wiki is mastery-only** — full wiki entries with definitions, examples, and personal notes are a V1 feature. The wiki currently shows concept mastery scores from quizzes.
- **No post-session wiki review** — the wiki review gate (V1) will let users review and edit AI-generated wiki entries after each session.

---

## Roadmap

**V0.5** (next)

- Flashcards + spaced repetition
- Audio/video ingestion via Whisper transcription
- Post-session wiki review gate
- Session summary card on close
- Behavioural learner profile inference

**V1**

- Full wiki entries with AI-drafted definitions and personal notes
- Formal BKT/DKT knowledge tracing
- Classroom / multi-user mode
- Teacher dashboard
- Adaptive interface reflow based on usage patterns
- Mobile app

---

## Contributing

This is a solo project in active development. If you find a bug or have a suggestion, open an issue.

---

## License

MIT
