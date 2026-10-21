import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DB_PATH = Path(os.getenv("DB_PATH", "data/inbox.db"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
# The answer step only rewrites retrieved text, so a lite model is enough: ~2s vs 30s+ for 3.8-flash
CHAT_MODEL = os.getenv("CHAT_MODEL", "gemini-3.5-flash-lite")
# gemini-embedding-001 can return 768/1536/3072 dims; 768 keeps storage small with little quality loss
EMBED_DIM = 768
