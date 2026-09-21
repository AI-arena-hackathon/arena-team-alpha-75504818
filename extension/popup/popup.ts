import { ExtensionConfig, DEFAULT_CONFIG, STORAGE_KEYS } from '../src/types';

const endpointInput = document.getElementById('endpoint') as HTMLInputElement;
const autoCaptureInput = document.getElementById('autoCapture') as HTMLInputElement;
const saveConfigBtn = document.getElementById('saveConfig') as HTMLButtonElement;
const sessionIdEl = document.getElementById('sessionId') as HTMLSpanElement;
const resetSessionBtn = document.getElementById('resetSession') as HTMLButtonElement;
const testCaptureBtn = document.getElementById('testCapture') as HTMLButtonElement;
const testResultEl = document.getElementById('testResult') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;

async function loadConfig(): Promise<void> {
  const config = await getConfig();
  endpointInput.value = config.ingestEndpoint;
  autoCaptureInput.checked = config.autoCapture;
}

async function getConfig(): Promise<ExtensionConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CONFIG, (result) => {
      const stored = result[STORAGE_KEYS.CONFIG];
      resolve({ ...DEFAULT_CONFIG, ...stored });
    });
  });
}

async function loadSession(): Promise<void> {
  const session = await getStoredSession();
  if (session) {
    sessionIdEl.textContent = session.sessionId;
  } else {
    sessionIdEl.textContent = '—';
  }
}

async function getStoredSession(): Promise<{ sessionId: string; createdAt: number; lastActivity: number } | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.SESSION, (result) => {
      resolve(result[STORAGE_KEYS.SESSION] || null);
    });
  });
}

async function checkConnection(): Promise<void> {
  const config = await getConfig();
  try {
    const response = await fetch(config.ingestEndpoint.replace('/api/ingest/click', '/health'), {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'status connected';
    } else {
      throw new Error('Health check failed');
    }
  } catch {
    statusEl.textContent = 'Offline';
    statusEl.className = 'status error';
  }
}

saveConfigBtn.addEventListener('click', async () => {
  saveConfigBtn.disabled = true;
  saveConfigBtn.textContent = 'Saving...';
  try {
    await setConfig({
      ingestEndpoint: endpointInput.value || DEFAULT_CONFIG.ingestEndpoint,
      autoCapture: autoCaptureInput.checked,
    });
    showResult('Configuration saved', true);
  } catch (error) {
    showResult(`Failed: ${error}`, false);
  } finally {
    saveConfigBtn.disabled = false;
    saveConfigBtn.textContent = 'Save';
  }
});

resetSessionBtn.addEventListener('click', async () => {
  resetSessionBtn.disabled = true;
  resetSessionBtn.textContent = 'Resetting...';
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.SESSION);
    sessionIdEl.textContent = '—';
    showResult('Session reset', true);
  } catch (error) {
    showResult(`Failed: ${error}`, false);
  } finally {
    resetSessionBtn.disabled = false;
    resetSessionBtn.textContent = 'Reset Session';
  }
});

testCaptureBtn.addEventListener('click', async () => {
  testCaptureBtn.disabled = true;
  testCaptureBtn.textContent = 'Capturing...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.location.href,
      });
      const response = await chrome.runtime.sendMessage({
        type: 'CAPTURE_CLICK',
        payload: { url: tab.url!, timestamp: Date.now() },
      });
      if (response?.success) {
        showResult(`Captured: ${response.sessionId}`, true);
        await loadSession();
      } else {
        showResult(`Failed: ${response?.error || 'Unknown error'}`, false);
      }
    }
  } catch (error) {
    showResult(`Failed: ${error}`, false);
  } finally {
    testCaptureBtn.disabled = false;
    testCaptureBtn.textContent = 'Capture Current Page';
  }
});

async function setConfig(config: Partial<ExtensionConfig>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CONFIG, (result) => {
      const current = result[STORAGE_KEYS.CONFIG] || {};
      chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: { ...current, ...config } }, resolve);
    });
  });
}

function showResult(message: string, success: boolean): void {
  testResultEl.textContent = message;
  testResultEl.className = `result show ${success ? 'success' : 'error'}`;
  setTimeout(() => {
    testResultEl.classList.remove('show');
  }, 5000);
}

loadConfig();
loadSession();
checkConnection();