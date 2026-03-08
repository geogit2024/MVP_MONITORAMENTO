type SwipeTraceEntry = {
  ts: string;
  scope: string;
  event: string;
  payload?: unknown;
};

declare global {
  interface Window {
    __SWIPE_DEBUG__?: boolean;
    __SWIPE_TRACE__?: SwipeTraceEntry[];
  }
}

const SWIPE_DEBUG_STORAGE_KEY = 'app.swipe.debug';
const MAX_TRACE_ENTRIES = 500;

const isDev = () => {
  try {
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
};

export const isSwipeDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  if (window.__SWIPE_DEBUG__ === true) return true;
  if (window.localStorage.getItem(SWIPE_DEBUG_STORAGE_KEY) === '1') return true;
  return isDev();
};

const pushTrace = (entry: SwipeTraceEntry) => {
  if (typeof window === 'undefined') return;
  if (!window.__SWIPE_TRACE__) window.__SWIPE_TRACE__ = [];
  window.__SWIPE_TRACE__.push(entry);
  if (window.__SWIPE_TRACE__.length > MAX_TRACE_ENTRIES) {
    window.__SWIPE_TRACE__.splice(0, window.__SWIPE_TRACE__.length - MAX_TRACE_ENTRIES);
  }
};

export const swipeDebug = (scope: string, event: string, payload?: unknown) => {
  if (!isSwipeDebugEnabled()) return;
  const entry: SwipeTraceEntry = {
    ts: new Date().toISOString(),
    scope,
    event,
    payload,
  };
  pushTrace(entry);
  if (typeof payload === 'undefined') {
    console.debug(`[SWIPE][${scope}] ${event}`);
    return;
  }
  console.debug(`[SWIPE][${scope}] ${event}`, payload);
};

export const swipeDebugWarn = (scope: string, event: string, payload?: unknown) => {
  if (!isSwipeDebugEnabled()) return;
  const entry: SwipeTraceEntry = {
    ts: new Date().toISOString(),
    scope,
    event: `WARN:${event}`,
    payload,
  };
  pushTrace(entry);
  if (typeof payload === 'undefined') {
    console.warn(`[SWIPE][${scope}] ${event}`);
    return;
  }
  console.warn(`[SWIPE][${scope}] ${event}`, payload);
};

