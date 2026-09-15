export const WEIGHT_STORAGE_KEY = "morning-call:weight-history:v1";

export function normalizeWeight(pounds) {
  const value = Number(pounds);
  if (!Number.isFinite(value) || value < 80 || value > 500) throw new Error("Enter a valid bodyweight.");
  return Math.round(value * 10) / 10;
}

export function loadWeightHistory(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(WEIGHT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addWeightObservation(pounds, source = "manual", storage = localStorage, now = new Date()) {
  const observation = { id: crypto.randomUUID(), pounds: normalizeWeight(pounds), recordedAt: now.toISOString(), source };
  const items = [observation, ...loadWeightHistory(storage)].slice(0, 90);
  storage.setItem(WEIGHT_STORAGE_KEY, JSON.stringify(items));
  return { items, observation };
}

export function formatWeightDelta(items) {
  if (items.length < 2) return items.length ? "First reading" : "No readings yet";
  const delta = items[0].pounds - items[1].pounds;
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} lb from previous`;
}
