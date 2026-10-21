# AI Knowledge Inbox

Save notes and links, then ask questions about them. Answers are generated only from what you've
saved, and every answer lists the sources it used.

- **Backend:** FastAPI, SQLite, Gemini (embeddings + answer generation)
- **Frontend:** React (Vite), plain CSS, GSAP for motion

## Running it

You need Python 3.11+ (I used 3.14), Node 20+, and a Gemini API key from
[Google AI Studio](https://aistudio.google.com/apikey). The free tier is enough.

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # then put your key in GEMINI_API_KEY
uvicorn app.main:app --reload
```

The API runs on http://localhost:8000 (interactive docs at `/docs`). The server refuses to start
without `GEMINI_API_KEY`, so a missing key shows up immediately instead of on the first request.

Optional settings in `.env`:

| Variable          | Default                  | What it does                              |
| ----------------- | ------------------------ | ----------------------------------------- |
| `CHAT_MODEL`      | `gemini-3.5-flash-lite`  | Model that writes the answer              |
| `EMBED_MODEL`     | `gemini-embedding-001`   | Embedding model                           |
| `DB_PATH`         | `data/inbox.db`          | SQLite file, created on first run         |
| `FRONTEND_ORIGIN` | `http://localhost:5173`  | The only origin CORS allows               |
| `LOG_LEVEL`       | `INFO`                   |                                           |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. If the backend isn't on port 8000, set `VITE_API_URL`. If Vite picks
a different port (because 5173 is taken), the browser will block the requests with a CORS error.
Either free the port or change `FRONTEND_ORIGIN` to match.

### Tests

```bash
cd backend
pytest
```

The tests cover the chunker (sizes, overlap, edge cases) and the parts of the RAG step that don't
need the network: prompt building and citation parsing.

## Using it

The left side is a chat. Type a question and press Enter. To save something, press **+** and pick
**Save a note** or **Save a link**. A saved item shows up on the right straight away as `pending`,
then flips to `ready` once it has been fetched, chunked and embedded (or `failed`, with the reason).
Clicking a source under an answer scrolls to that item in the inbox.

On narrow screens the two panes become two views, switched from the header.

## API

All errors use the same shape:

```json
{ "error": { "code": "validation_error", "message": "Request body is invalid", "details": [{ "field": "url", "message": "..." }] } }
```

| Code               | Status | When                                                  |
| ------------------ | ------ | ----------------------------------------------------- |
| `validation_error` | 422    | Bad request body                                      |
| `ai_service_error` | 502    | Gemini failed or timed out after retries              |
| `internal_error`   | 500    | Anything unexpected. The message includes a request id |

Every response carries an `X-Request-ID` header that matches the server logs.

### `POST /ingest` → 202

```json
{ "source_type": "note", "content": "The wifi password is on the whiteboard." }
{ "source_type": "url", "url": "https://example.com/article" }
```

Returns the new item with `status: "pending"`. Processing happens after the response is sent,
which is why this is a 202 and not a 201. Notes can be up to 20,000 characters. URLs must be
http or https.

### `GET /items` → 200

```json
{ "items": [{ "id": 3, "source_type": "url", "url": "...", "title": "...", "preview": "first 200 chars",
              "status": "ready", "error": null, "created_at": "2026-10-21T08:30:00+00:00" }] }
```

Newest first. The frontend polls this every 1.5 seconds, but only while something is pending.

### `POST /query` → 200

```json
{ "question": "When does the library close on Fridays?", "top_k": 5 }
```

```json
{
  "answer": "The library closes at 9pm on Fridays [1].",
  "sources": [{ "citation": 1, "item_id": 9, "source_type": "note", "title": null, "url": null,
                "snippet": "...", "score": 0.73 }]
}
```

`top_k` is 1–10 (default 5). `sources` only contains the chunks the answer actually cited, and
`citation` is the `[n]` number used in the text.

## How it works

```
POST /ingest ──► insert item (pending) ──► 202
                        │
                        ▼  background task
         URL? fetch page + extract text (trafilatura)
                        │
             split into ~1200-char chunks
                        │
         embed chunks (Gemini, RETRIEVAL_DOCUMENT)
                        │
     store chunks + vectors, mark ready  (one transaction)


POST /query ──► embed question (RETRIEVAL_QUERY)
                        │
          cosine similarity against every chunk
                        │
          keep top_k, drop anything below 0.55
                        │
         nothing left? ──► "I couldn't find anything..." (no LLM call)
                        │
       prompt with numbered <source> blocks ──► Gemini
                        │
        parse [n] citations, return cited sources
```

Code layout (`backend/app/`):

- `routes.py` – the three endpoints, kept thin
- `pipeline.py` – the background ingest job
- `fetcher.py` – downloads a page safely (see SSRF below)
- `chunker.py` – splits text into overlapping chunks
- `gemini.py` – embedding and generation calls, retries and timeouts
- `retrieval.py` – vector search
- `rag.py` – builds the prompt, calls the model, parses citations
- `db.py` – SQLite schema and queries
- `main.py` – app setup, error handlers, request logging

## Design decisions and tradeoffs

**SQLite with vectors stored as BLOBs, searched with numpy.** Every query loads all chunk vectors
and does one matrix multiply. At 768 dimensions that's about 3 KB per chunk, so 10,000 chunks is
~30 MB and the search takes a few milliseconds. It means no extra service to run and nothing to
keep in sync: an item and its chunks are written in one transaction, so an item is never `ready`
with half its chunks missing. The cost is that it's O(n) per query and everything is loaded into
memory. See the scale section for what I'd switch to.

**Background tasks instead of a job queue.** `/ingest` returns immediately and FastAPI's
`BackgroundTasks` does the slow part (fetching a page, calling the embedding API) in the same
process. That keeps the setup to one command. The downside is that jobs die with the server, so on
startup anything still `pending` is marked `failed` with "Interrupted by server restart" rather
than sitting there forever. There are also no automatic retries for a failed item.

**Chunking: ~1200 characters with 200 characters of overlap.** That's roughly 250–300 tokens: small
enough that a match points at something specific, large enough to keep a paragraph's context. The
chunker packs whole paragraphs where it can, falls back to sentences for long paragraphs, and only
hard-cuts text that has neither. The overlap starts on a word boundary so a chunk doesn't begin
mid-word. Short notes end up as a single chunk.

**Embeddings.** `gemini-embedding-001` at 768 dimensions instead of the full 3072. Retrieval
quality drops very little and storage is 4× smaller. Documents and queries use different task
types (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`), which Gemini uses to optimize for this
asymmetric search. Vectors are normalized on the way in, so a dot product is cosine similarity.

**A minimum score of 0.55.** Without a cutoff, top-k always returns *something*, and the model then
tries to answer from irrelevant text. With it, an unrelated question gets a fixed "I couldn't find
anything" answer and no LLM call is made at all, which is also cheaper. I picked 0.55 by trying
related and unrelated questions against my test data. It's a heuristic and would need tuning on
real data.

**Citations the app can check.** Sources go into the prompt as `<source id="1" ...>` blocks and the
model is told to cite them as `[1]`. The response is parsed for those numbers and only the cited
sources are returned, so the list under an answer matches what the text actually refers to. If the
model cites a number that doesn't exist, it's ignored.

**Prompt injection.** Saved pages are untrusted text. The system prompt says sources are data and
that instructions inside them must not be followed, and sources are clearly delimited. This
reduces the risk but doesn't eliminate it. Nothing the model outputs is executed, and the
frontend renders the answer as plain text, never HTML.

**SSRF protection on URL fetching.** Without it, anyone who can call `/ingest` could make the
server fetch `http://localhost:...` or cloud metadata addresses and read the result back through
`/query`. Every request, including each redirect, is checked: the hostname is resolved and
rejected if it points at a private, loopback, link-local or otherwise non-public address. Fetches
also have a 10 s timeout, a 5 MB limit and at most 5 redirects. One known gap: DNS is resolved
once for the check and again by the HTTP client, so a DNS rebinding attack could slip through.
Fixing that means connecting to the checked IP directly.

**Model choice.** The answer step only rewrites retrieved text into a sentence or two, so
`gemini-3.5-flash-lite` is enough. It answered in about 2 s in my testing, against 30 s+ for a
larger model. It can be changed with `CHAT_MODEL`.

**Gemini calls** get up to 4 attempts with backoff and time out after 30 s. When they still fail
the API returns a 502 `ai_service_error` instead of a generic 500, so the frontend can say it was
the AI service.

**Polling instead of WebSockets or SSE.** Only `GET /items` is polled, only while an item is
pending, and processing takes a few seconds. A push channel would be more code on both sides for
no visible difference here.

**No conversation memory.** Each question is answered on its own. "What about on Saturdays?" won't
know you were asking about the library. The chat UI looks like a conversation, but `/query` is
stateless. Adding this means sending recent turns along and rewriting the follow-up into a
standalone question before retrieval.

**Frontend.** Plain JavaScript and CSS, no UI library, to keep it small and easy to follow. State
lives in two places: `useItems` owns the saved items (and polling), and `Chat` owns the messages.
GSAP handles motion: messages rising in, answers revealing word by word, sources and inbox cards
staggering in, the status badge popping when processing finishes, and a highlight when you jump
to a source. Everything is turned off for people who have "reduce motion" enabled in their OS.

**Not built:** auth, deleting or editing items, re-trying failed items, streaming answers, and
PDF or other file uploads.

## What breaks at scale

Roughly in the order they'd hit:

1. **Vector search.** Brute force loads every vector on every query. Somewhere past ~100k chunks it
   gets slow and memory-hungry. Next step is an ANN index: `sqlite-vec` to stay on SQLite, or
   Postgres with `pgvector` (HNSW) if moving databases anyway.
2. **Gemini rate limits.** The free tier allows only a few requests per minute. During testing a
   single query sometimes took 20 s because the client was retrying after 429s. Ingesting many
   items at once would hit this first. It needs a paid tier, plus a queue that throttles embedding
   calls.
3. **Background jobs.** In-process tasks share the web server's threads and are lost on restart or
   deploy. A real queue (Redis + RQ/Celery, or a hosted one) would give retries, visibility, and
   workers that scale separately from the API.
4. **SQLite writes.** WAL mode lets reads continue during writes, but there's still one writer at a
   time and it only works on one machine. Multiple API instances need Postgres.
5. **`GET /items` returns everything** with no pagination, and the frontend renders every item.
   Needs cursor-based pagination and probably search.
6. **No users.** Everyone shares one inbox. Multi-user means auth, a `user_id` on items and chunks,
   and filtering retrieval by user. That filter is a security boundary, so it needs tests.
7. **Re-embedding.** Changing the embedding model or dimensions makes every stored vector useless.
   Chunks should record which model produced them so old ones can be re-embedded in the background.
8. **Fetching arbitrary URLs** from the API server is a liability at scale (abuse, slow sites tying
   up workers). It belongs in an isolated worker with its own network rules.
