import logging

from fastapi import APIRouter, BackgroundTasks

from . import db
from .pipeline import process_item
from .rag import answer_question
from .schemas import IngestRequest, ItemList, ItemOut, NoteIn, QueryIn, QueryOut

log = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ingest", status_code=202)
def ingest(body: IngestRequest, background: BackgroundTasks) -> ItemOut:
    if isinstance(body, NoteIn):
        item = db.create_item("note", content=body.content)
    else:
        item = db.create_item("url", url=str(body.url))

    background.add_task(process_item, item["id"])
    log.info("item queued", extra={"item_id": item["id"], "source_type": item["source_type"]})
    return ItemOut.from_row(item)


@router.get("/items")
def list_items() -> ItemList:
    return ItemList(items=[ItemOut.from_row(row) for row in db.list_items()])


@router.post("/query")
def query(body: QueryIn) -> QueryOut:
    return answer_question(body.question, body.top_k)
