export const SESSION_STORAGE_KEY = "morning-call:sessions:v1";

export function loadSessions(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveSession(session, storage = localStorage) {
  const sessions = [session, ...loadSessions(storage).filter((item) => item.id !== session.id)].slice(0, 90);
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  return sessions;
}
