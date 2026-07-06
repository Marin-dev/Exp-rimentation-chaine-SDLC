// Lightweight per-thread chat persistence in the browser, so reloading the page
// doesn't lose an in-progress conversation with an agent. Keyed per thread
// (orchestrator, or a given phase) and per workspace by the caller.
const PREFIX = "sdlc-chat:";
const MAX_MESSAGES = 200;

export function loadThread(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveThread(key, messages) {
  try {
    const trimmed = Array.isArray(messages) ? messages.slice(-MAX_MESSAGES) : [];
    localStorage.setItem(PREFIX + key, JSON.stringify(trimmed));
  } catch {
    // storage full / disabled — a lost thread is acceptable, don't break the chat.
  }
}

export function clearThread(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}
