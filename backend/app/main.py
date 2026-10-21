import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .config import FRONTEND_ORIGIN, GEMINI_API_KEY, LOG_LEVEL
from .gemini import AIServiceError
from .logs import setup_logging
from .routes import router

setup_logging(LOG_LEVEL)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key.")
    db.init_db()
    yield


app = FastAPI(title="AI Knowledge Inbox", lifespan=lifespan)


def error_response(status: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    error = {"code": code, "message": message}
    if details:
        error["details"] = details
    return JSONResponse(status_code=status, content={"error": error})


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = uuid.uuid4().hex[:12]
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error", extra={"request_id": request_id})
        response = error_response(
            500, "internal_error", f"Something went wrong (request id {request_id})"
        )
    response.headers["X-Request-ID"] = request_id
    log.info(
        "request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - started) * 1000),
        },
    )
    return response


# Added after the logging middleware so it wraps it, and 500s still get CORS headers
app.add_middleware(CORSMiddleware, allow_origins=[FRONTEND_ORIGIN], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # loc looks like ("body", "url", "url") - the middle part is the union tag, so keep only the field name
    details = [
        {"field": err["loc"][-1] if isinstance(err["loc"][-1], str) else "body", "message": err["msg"]}
        for err in exc.errors()
    ]
    return error_response(422, "validation_error", "Request body is invalid", details)


@app.exception_handler(AIServiceError)
async def ai_service_error(request: Request, exc: AIServiceError):
    log.warning("ai service error", extra={"path": request.url.path, "reason": str(exc)})
    return error_response(502, "ai_service_error", str(exc))


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return error_response(exc.status_code, "http_error", str(exc.detail))


app.include_router(router)
