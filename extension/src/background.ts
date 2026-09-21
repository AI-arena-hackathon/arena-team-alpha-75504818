import { ExtensionConfig, ClickEvent, DEFAULT_CONFIG, STORAGE_KEYS } from './types';
import { getOrCreateSession, sendClickEvent, getConfig, setConfig } from './utils';

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(null, resolve);
  });
  if (!stored[STORAGE_KEYS.CONFIG]) {
    await setConfig(DEFAULT_CONFIG);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_CLICK') {
    handleCaptureClick(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === 'GET_CONFIG') {
    getConfig().then(sendResponse);
    return true;
  }
  if (message.type === 'SET_CONFIG') {
    setConfig(message.payload).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'RESET_SESSION') {
    chrome.storage.local.remove(STORAGE_KEYS.SESSION).then(() => sendResponse({ success: true }));
    return true;
  }
});

async function handleCaptureClick(payload: { url: string; timestamp: number }): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const config = await getConfig();
    const sessionId = await getOrCreateSession(config);

    const utmParams = extractUtmParams(payload.url);

    const clickEvent: ClickEvent = {
      sessionId,
      url: payload.url,
      timestamp: payload.timestamp,
      ...utmParams,
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent,
      consentGiven: true,
      consentTimestamp: Date.now(),
      consentVersion: '1.0',
    };

    const success = await sendClickEvent(clickEvent, config.ingestEndpoint);
    return { success, sessionId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

function extractUtmParams(url: string): Partial<ClickEvent> {
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