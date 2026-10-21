import re

MAX_CHARS = 1200  # roughly 250-300 tokens: small enough to be specific, big enough to keep context
OVERLAP_CHARS = 200

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def chunk_text(text: str, max_chars: int = MAX_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    """Pack paragraphs into chunks of up to max_chars, each starting with the tail of the previous one.

    Paragraphs are kept whole when they fit, so a chunk usually covers one idea.
    Paragraphs that are too long get split by sentence, then by hard cut as a last resort.
    """
    # Pieces must leave room for the overlap (+ joining newline) prepended to each new chunk
    piece_limit = max_chars - overlap - 1
    pieces = []
    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        if paragraph:
            pieces.extend(_split_long(paragraph, piece_limit))

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if current and len(current) + 1 + len(piece) > max_chars:
            chunks.append(current)
            current = _tail(current, overlap)
        current = f"{current}\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks


def _split_long(paragraph: str, limit: int) -> list[str]:
    if len(paragraph) <= limit:
        return [paragraph]
    pieces = []
    for sentence in _SENTENCE_END.split(paragraph):
        while len(sentence) > limit:
            pieces.append(sentence[:limit])
            sentence = sentence[limit:]
        pieces.append(sentence)
    return pieces


def _tail(text: str, size: int) -> str:
    """Last `size` chars of text, starting at a word boundary so the overlap doesn't open mid-word."""
    if len(text) <= size:
        return text
    tail = text[-size:]
    space = tail.find(" ")
    return tail[space + 1:] if space != -1 else tail
