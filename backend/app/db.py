import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('note', 'url')),
    url         TEXT,
    title       TEXT,
    content     TEXT,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
    error       TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
    id        INTEGER PRIMARY KEY,
    item_id   INTEGER NOT NULL REFERENCES items(id),
    position  INTEGER NOT NULL,
    text      TEXT NOT NULL,
    embedding BLOB NOT NULL  -- float32 vector, unit length
);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:  # commit on success, rollback on exception
            yield conn
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        # WAL lets the API read while a background job is writing
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        # Jobs run in-process, so anything still pending after a restart is never going to finish
        conn.execute(
            "UPDATE items SET status = 'failed', error = 'Interrupted by server restart' "
            "WHERE status = 'pending'"
        )


def create_item(source_type: str, *, url: str | None = None, content: str | None = None) -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO items (source_type, url, content, created_at) VALUES (?, ?, ?, ?)",
            (source_type, url, content, created_at),
        )
        row = conn.execute("SELECT * FROM items WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


def get_item(item_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    return dict(row) if row else None


def list_items() -> list[dict]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM items ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


def save_content(item_id: int, title: str | None, content: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE items SET title = ?, content = ? WHERE id = ?", (title, content, item_id)
        )


def complete_item(item_id: int, chunks: list[str], embeddings: list[bytes]) -> None:
    # One transaction: an item is only "ready" if all of its chunks made it in
    with connect() as conn:
        conn.executemany(
            "INSERT INTO chunks (item_id, position, text, embedding) VALUES (?, ?, ?, ?)",
            [(item_id, i, text, emb) for i, (text, emb) in enumerate(zip(chunks, embeddings))],
        )
        conn.execute("UPDATE items SET status = 'ready', error = NULL WHERE id = ?", (item_id,))


def all_chunks() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT c.id, c.item_id, c.position, c.text, c.embedding, i.title, i.url, i.source_type "
            "FROM chunks c JOIN items i ON i.id = c.item_id"
        ).fetchall()
    return [dict(r) for r in rows]


def set_status(item_id: int, status: str, error: str | None = None) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE items SET status = ?, error = ? WHERE id = ?", (status, error, item_id)
        )
