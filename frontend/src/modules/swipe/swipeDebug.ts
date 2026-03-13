type SwipeTraceEntry = {
  ts: string;
  scope: string;
  event: string;
  payload?: unknown;
};

declare global {
  interface Window {
    __SWIPE_DEBUG__?: boolean;
    __SWIPE_DEBUG_CONSOLE__?: boolean;
    __SWIPE_TRACE__?: SwipeTraceEntry[];
  }
}

const SWIPE_DEBUG_STORAGE_KEY = 'app.swipe.debug';
const MAX_TRACE_ENTRIES = 120;
const MAX_STRING_LENGTH = 512;
const MAX_ARRAY_ITEMS = 24;
const MAX_OBJECT_KEYS = 24;
const MAX_DEPTH = 3;

export const isSwipeDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  if (window.__SWIPE_DEBUG__ === true) return true;
  return window.localStorage.getItem(SWIPE_DEBUG_STORAGE_KEY) === '1';
};

const pushTrace = (entry: SwipeTraceEntry) => {
  if (typeof window === 'undefined') return;
  if (!window.__SWIPE_TRACE__) window.__SWIPE_TRACE__ = [];
  window.__SWIPE_TRACE__.push(entry);
  if (window.__SWIPE_TRACE__.length > MAX_TRACE_ENTRIES) {
    window.__SWIPE_TRACE__.splice(0, window.__SWIPE_TRACE__.length - MAX_TRACE_ENTRIES);
  }
};

const truncateString = (value: string) =>
  value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH)}...<truncated:${value.length}>`;

const sanitizePayload = (value: unknown, depth = 0): unknown => {
  if (value == null) return value;
  if (depth >= MAX_DEPTH) return '<max-depth>';
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizePayload(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      sliced.push(`<truncated:${value.length - MAX_ARRAY_ITEMS}>`);
    }
    return sliced;
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source);
    const selected = keys.slice(0, MAX_OBJECT_KEYS);
    const out: Record<string, unknown> = {};
    selected.forEach((key) => {
      out[key] = sanitizePayload(source[key], depth + 1);
    });
    if (keys.length > MAX_OBJECT_KEYS) {
      out.__truncated_keys__ = keys.length - MAX_OBJECT_KEYS;
    }
    return out;
  }
  return String(value);
};

export const swipeDebug = (scope: string, event: string, payload?: unknown) => {
  if (!isSwipeDebugEnabled()) return;
  const safePayload = typeof payload === 'undefined' ? undefined : sanitizePayload(payload);
  const entry: SwipeTraceEntry = {
    ts: new Date().toISOString(),
    scope,
    event,
    payload: safePayload,
  };
  pushTrace(entry);
  // Console output is opt-in to avoid flooding DevTools with large debug streams.
  if (typeof window !== 'undefined' && window.__SWIPE_DEBUG_CONSOLE__ !== true) return;
  if (typeof safePayload === 'undefined') {
    console.debug(`[SWIPE][${scope}] ${event}`);
    return;
  }
  console.debug(`[SWIPE][${scope}] ${event}`, safePayload);
};

export const swipeDebugWarn = (scope: string, event: string, payload?: unknown) => {
  if (!isSwipeDebugEnabled()) return;
  const safePayload = typeof payload === 'undefined' ? undefined : sanitizePayload(payload);
  const entry: SwipeTraceEntry = {
    ts: new Date().toISOString(),
    scope,
    event: `WARN:${event}`,
    payload: safePayload,
  };
  pushTrace(entry);
  // Console output is opt-in to avoid flooding DevTools with large debug streams.
  if (typeof window !== 'undefined' && window.__SWIPE_DEBUG_CONSOLE__ !== true) return;
  if (typeof safePayload === 'undefined') {
    console.warn(`[SWIPE][${scope}] ${event}`);
    return;
  }
  console.warn(`[SWIPE][${scope}] ${event}`, safePayload);
};
