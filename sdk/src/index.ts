import {
  SDKConfig,
  RecordActivationOptions,
  RecordActivationResult,
  SDKInstance,
} from './types';

const DEFAULT_CONFIG: SDKConfig = {
  endpoint: 'http://localhost:3000/api/ingest/activation',
  timeout: 5000,
  retries: 3,
};

let config: SDKConfig = { ...DEFAULT_CONFIG };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (retries > 0 && error instanceof Error && error.name === 'AbortError') {
      await sleep(1000);
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    throw error;
  }
}

export function configure(newConfig: Partial<SDKConfig>): void {
  config = { ...config, ...newConfig };
}

export function getConfig(): SDKConfig {
  return { ...config };
}

export async function recordActivation(
  options: RecordActivationOptions
): Promise<RecordActivationResult> {
  const { userId, plan, timestamp, sessionId, revenue, metadata } = options;

  const payload = {
    userId,
    plan,
    timestamp: timestamp ?? Date.now(),
    ...(sessionId && { sessionId }),
    ...(revenue !== undefined && { revenue }),
    ...(metadata && { metadata }),
  };

  try {
    const response = await fetchWithRetry(
      config.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
        },
        body: JSON.stringify(payload),
      },
      config.retries ?? DEFAULT_CONFIG.retries!,
      config.timeout ?? DEFAULT_CONFIG.timeout!
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        userId,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      userId: result.userId || userId,
    };
  } catch (error) {
    return {
      success: false,
      userId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const sdk: SDKInstance = {
  recordActivation,
  configure,
  getConfig,
};

export default sdk;
export { configure, getConfig, recordActivation };