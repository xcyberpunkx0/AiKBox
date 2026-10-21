const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      ...options,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new Error("Can't reach the server. Is the backend running?");
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Backend errors look like { error: { code, message, details: [{ field, message }] } }
    const error = body?.error;
    const details = error?.details?.map((d) => `${d.field}: ${d.message}`).join("; ");
    throw new Error(details || error?.message || `Request failed (${res.status})`);
  }
  return body;
}

export async function getItems() {
  const body = await request("/items");
  return body.items;
}

export function ingest(payload) {
  return request("/ingest", { method: "POST", body: JSON.stringify(payload) });
}

export function askQuestion(question) {
  return request("/query", { method: "POST", body: JSON.stringify({ question }) });
}
