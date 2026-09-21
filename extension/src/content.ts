import { ClickEvent } from './types';

interface CaptureMessage {
  type: 'CAPTURE_CLICK';
  payload: { url: string; timestamp: number };
}

let captured = false;

function capturePageLoad(): void {
  if (captured) return;
  captured = true;

  const url = window.location.href;
  const timestamp = Date.now();

  const message: CaptureMessage = {
    type: 'CAPTURE_CLICK',
    payload: { url, timestamp },
  };

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.debug('[Acquisition Signal] Failed to send capture message:', chrome.runtime.lastError.message);
    } else if (response?.success) {
      console.debug('[Acquisition Signal] Click captured:', response.sessionId);
    } else {
      console.debug('[Acquisition Signal] Capture failed:', response?.error);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', capturePageLoad);
} else {
  capturePageLoad();
}

let currentUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    captured = false;
    capturePageLoad();
  }
});

observer.observe(document, { subtree: true, childList: true });

window.addEventListener('popstate', () => {
  captured = false;
  capturePageLoad();
});

const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  captured = false;
  capturePageLoad();
};

const originalReplaceState = history.replaceState;
history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  captured = false;
  capturePageLoad();
};