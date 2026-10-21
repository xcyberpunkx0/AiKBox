import ipaddress
import socket
from dataclasses import dataclass

import httpx
import trafilatura

MAX_BYTES = 5 * 1024 * 1024
ALLOWED_TYPES = ("text/html", "application/xhtml+xml", "text/plain")
USER_AGENT = "KnowledgeInbox/0.1 (+https://github.com/knowledge-inbox)"


class FetchError(Exception):
    """A fetch failure with a message that's safe to show the user."""


@dataclass
class Page:
    title: str | None
    text: str


def fetch_page(url: str) -> Page:
    try:
        with httpx.Client(
            timeout=10.0,
            follow_redirects=True,
            max_redirects=5,
            # Wikipedia and others reject bot user agents without a contact URL
            headers={"User-Agent": USER_AGENT},
            event_hooks={"request": [_reject_private_hosts]},  # runs on every redirect too
        ) as client, client.stream("GET", url) as resp:
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "").split(";")[0].strip()
            if content_type not in ALLOWED_TYPES:
                raise FetchError(f"Unsupported content type: {content_type or 'unknown'}")
            body = _read_capped(resp)
            charset = resp.charset_encoding
    except httpx.HTTPStatusError as e:
        raise FetchError(f"Page returned HTTP {e.response.status_code}") from e
    except httpx.TimeoutException as e:
        raise FetchError("Timed out fetching the page") from e
    except httpx.HTTPError as e:
        raise FetchError(f"Could not fetch the page: {e}") from e

    if content_type == "text/plain":
        return Page(title=None, text=body.decode(charset or "utf-8", errors="replace").strip())

    # trafilatura strips nav/ads/footers and keeps the main article text
    text = trafilatura.extract(body, include_comments=False)
    if not text:
        raise FetchError("No readable text found on the page (it may need JavaScript)")
    meta = trafilatura.extract_metadata(body)
    return Page(title=meta.title if meta else None, text=text)


def _read_capped(resp: httpx.Response) -> bytes:
    chunks, size = [], 0
    for chunk in resp.iter_bytes():
        size += len(chunk)
        if size > MAX_BYTES:
            raise FetchError("Page is larger than 5 MB")
        chunks.append(chunk)
    return b"".join(chunks)


def _reject_private_hosts(request: httpx.Request) -> None:
    # Stops the server from being used to hit localhost / internal network (SSRF).
    # Not airtight: DNS could change between this lookup and the real connect.
    host = request.url.host
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
    except socket.gaierror as e:
        raise FetchError(f"Could not resolve host '{host}'") from e
    if any(not ipaddress.ip_address(addr).is_global for addr in addresses):
        raise FetchError("URLs pointing at private or local addresses are not allowed")
