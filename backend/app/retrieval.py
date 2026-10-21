import numpy as np

from . import db
from .config import EMBED_DIM
from .gemini import embed_query


def search(question: str, k: int) -> list[dict]:
    """Top-k chunks by cosine similarity to the question, best first."""
    # Brute force over every chunk, loaded from SQLite on each call.
    # Fine for thousands of chunks; past that, swap in a real ANN index (sqlite-vec, pgvector, FAISS).
    rows = db.all_chunks()
    if not rows:
        return []
    matrix = np.frombuffer(b"".join(r["embedding"] for r in rows), dtype=np.float32)
    matrix = matrix.reshape(len(rows), EMBED_DIM)

    scores = matrix @ embed_query(question)
    best = np.argsort(-scores)[:k]
    return [
        {key: value for key, value in rows[i].items() if key != "embedding"} | {"score": float(scores[i])}
        for i in best
    ]
