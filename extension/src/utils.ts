import { ClickEvent, ExtensionConfig, StoredSession, DEFAULT_CONFIG, STORAGE_KEYS } from './types';

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function extractUtmParams(url: string): Partial<ClickEvent> {
  const params: Partial<ClickEvent> = {};
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
      if (key.startsWith('utm_')) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        (params as Record<string, string>)[camelKey] = value;
      } else if (key === 'acq_id') {
        params.acqId = value;
      }
    });
  } catch {
    // Invalid URL, ignore
  }
  return params;
}

export function getReferrer(): string | undefined {
  return document.referrer || undefined;
}

export function getUserAgent(): string {
  return navigator.userAgent;
}

export async function getStoredSession(): Promise<StoredSession | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.SESSION, (result) => {
      resolve(result[STORAGE_KEYS.SESSION] || null);
    });
  });
}

export async function setStoredSession(session: StoredSession): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: session }, resolve);
  });
}

export async function clearStoredSession(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEYS.SESSION, resolve);
  });
}

export async function getConfig(): Promise<ExtensionConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CONFIG, (result) => {
      const stored = result[STORAGE_KEYS.CONFIG];
      resolve({ ...DEFAULT_CONFIG, ...stored });
    });
  });
}

export async function setConfig(config: Partial<ExtensionConfig>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CONFIG, (result) => {
      const current = result[STORAGE_KEYS.CONFIG] || {};
      chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: { ...current, ...config } }, resolve);
    });
  });
}

export function isSessionExpired(session: StoredSession, timeoutMs: number): boolean {
  return Date.now() - session.lastActivity > timeoutMs;
}

export async function getOrCreateSession(config: ExtensionConfig): Promise<string> {
  const stored = await getStoredSession();
  const now = Date.now();

  if (stored && !isSessionExpired(stored, config.sessionTimeoutMs)) {
    await setStoredSession({ ...stored, lastActivity: now });
    return stored.sessionId;
  }

  const newSessionId = generateSessionId();
  await setStoredSession({ sessionId: newSessionId, createdAt: now, lastActivity: now });
  return newSessionId;
}

export async function sendClickEvent(event: ClickEvent, endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}