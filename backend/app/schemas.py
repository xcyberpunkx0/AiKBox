from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl, StringConstraints

PREVIEW_CHARS = 200

NoteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)]


class NoteIn(BaseModel):
    source_type: Literal["note"]
    content: NoteText


class UrlIn(BaseModel):
    source_type: Literal["url"]
    url: HttpUrl  # http/https only, max 2083 chars


# Pydantic picks the right model by looking at `source_type`
IngestRequest = Annotated[NoteIn | UrlIn, Field(discriminator="source_type")]


class ItemOut(BaseModel):
    id: int
    source_type: Literal["note", "url"]
    url: str | None
    title: str | None
    preview: str | None
    status: Literal["pending", "ready", "failed"]
    error: str | None
    created_at: datetime

    @classmethod
    def from_row(cls, row: dict) -> "ItemOut":
        content = row["content"]
        return cls(**row, preview=content[:PREVIEW_CHARS] if content else None)


class ItemList(BaseModel):
    items: list[ItemOut]


class QueryIn(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    top_k: int = Field(default=5, ge=1, le=10)


class SourceOut(BaseModel):
    citation: int  # the [n] number used in the answer text
    item_id: int
    source_type: Literal["note", "url"]
    title: str | None
    url: str | None
    snippet: str
    score: float


class QueryOut(BaseModel):
    answer: str
    sources: list[SourceOut]
