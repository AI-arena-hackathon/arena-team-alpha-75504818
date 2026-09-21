export interface ClickEvent {
  sessionId: string;
  url: string;
  timestamp: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  acqId?: string;
  referrer?: string;
  userAgent?: string;
  ipHash?: string;
  consentGiven?: boolean;
  consentTimestamp?: number;
  consentVersion?: string;
}

export interface ExtensionConfig {
  ingestEndpoint: string;
  sessionTimeoutMs: number;
  autoCapture: boolean;
}

export interface StoredSession {
  sessionId: string;
  createdAt: number;
  lastActivity: number;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  ingestEndpoint: 'http://localhost:3000/api/ingest/click',
  sessionTimeoutMs: 30 * 60 * 1000,
  autoCapture: true,
};

export const STORAGE_KEYS = {
  SESSION: 'acq_signal_session',
  CONFIG: 'acq_signal_config',
} as const;