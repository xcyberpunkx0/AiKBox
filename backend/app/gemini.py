import threading
from functools import cache

import numpy as np
from google import genai
from google.genai import errors, types

from .config import CHAT_MODEL, EMBED_DIM, EMBED_MODEL, GEMINI_API_KEY

EMBED_BATCH_SIZE = 100  # max texts per embed request


class AIServiceError(Exception):
    """The Gemini API call failed; message is safe to show the user."""


_client_lock = threading.Lock()


def _client() -> genai.Client:
    # Background jobs run in parallel threads. Without the lock two of them can build a client at
    # once; the one that isn't cached gets garbage collected and closes its socket mid-request.
    with _client_lock:
        return _build_client()


@cache
def _build_client() -> genai.Client:
    # Retries 429/5xx with backoff, which matters on the free tier's rate limits
    return genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=30_000, retry_options=types.HttpRetryOptions(attempts=4)
        ),
    )


def generate_answer(system_prompt: str, prompt: str) -> str:
    try:
        response = _client().models.generate_content(
            model=CHAT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system_prompt),
        )
    except errors.APIError as e:
        raise AIServiceError(f"Answer generation failed ({e.code}): {e.message}") from e
    if not response.text:
        raise AIServiceError("The model returned an empty answer")
    return response.text.strip()


def embed_documents(texts: list[str], title: str | None = None) -> np.ndarray:
    return _embed(texts, "RETRIEVAL_DOCUMENT", title)


def embed_query(text: str) -> np.ndarray:
    return _embed([text], "RETRIEVAL_QUERY")[0]


def _embed(texts: list[str], task_type: str, title: str | None = None) -> np.ndarray:
    config = types.EmbedContentConfig(
        task_type=task_type, output_dimensionality=EMBED_DIM, title=title
    )
    vectors = []
    try:
        for start in range(0, len(texts), EMBED_BATCH_SIZE):
            batch = texts[start:start + EMBED_BATCH_SIZE]
            response = _client().models.embed_content(model=EMBED_MODEL, contents=batch, config=config)
            vectors.extend(e.values for e in response.embeddings)
    except errors.APIError as e:
        raise AIServiceError(f"Embedding request failed ({e.code}): {e.message}") from e

    matrix = np.asarray(vectors, dtype=np.float32)
    # Unit length, so cosine similarity is just a dot product
    return matrix / np.linalg.norm(matrix, axis=1, keepdims=True)
