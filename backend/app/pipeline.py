import logging
import time

from . import db
from .chunker import chunk_text
from .fetcher import FetchError, fetch_page
from .gemini import AIServiceError, embed_documents

log = logging.getLogger(__name__)


def process_item(item_id: int) -> None:
    """Background job: fetch (for URLs) -> chunk -> embed -> store. Ends with the item ready or failed."""
    started = time.perf_counter()
    item = db.get_item(item_id)
    try:
        text, title = item["content"], item["title"]
        if item["source_type"] == "url":
            page = fetch_page(item["url"])
            db.save_content(item_id, page.title, page.text)
            text, title = page.text, page.title

        chunks = chunk_text(text)
        embeddings = embed_documents(chunks, title=title)
        db.complete_item(item_id, chunks, [vec.tobytes() for vec in embeddings])
    except (FetchError, AIServiceError) as e:
        log.warning("ingest failed", extra={"item_id": item_id, "reason": str(e)})
        db.set_status(item_id, "failed", str(e))
        return
    except Exception:
        log.exception("ingest crashed", extra={"item_id": item_id})
        db.set_status(item_id, "failed", "Internal error while processing this item")
        return

    log.info(
        "item ready",
        extra={
            "item_id": item_id,
            "chunks": len(chunks),
            "duration_ms": round((time.perf_counter() - started) * 1000),
        },
    )
