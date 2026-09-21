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

export interface ActivationEvent {
  userId: string;
  plan: string;
  timestamp: number;
  sessionId?: string;
  revenue?: number;
  metadata?: Record<string, unknown>;
}

export interface StitchedEvent {
  clickEvent: ClickEvent;
  activationEvent: ActivationEvent;
  matchType: 'deterministic' | 'probabilistic';
  confidence: number;
}

export interface ChannelCAC {
  channel: string;
  clicks: number;
  activations: number;
  cac: number;
  revenue: number;
}

export interface CreativePerformance {
  creative: string;
  landingPage: string;
  clicks: number;
  activations: number;
  cac: number;
  conversionRate: number;
}

export interface PrivacyAlert {
  type: 'consent_missing' | 'data_retention' | 'cross_border' | 'minors_detected';
  severity: 'warning' | 'critical';
  message: string;
  affectedRecords: number;
}

export interface AuditExportRow {
  eventType: 'click' | 'activation' | 'stitched';
  sessionId?: string;
  userId?: string;
  timestamp: number;
  channel?: string;
  creative?: string;
  landingPage?: string;
  revenue?: number;
  matchType?: string;
  confidence?: number;
  consentGiven?: boolean;
  consentTimestamp?: number;
  consentVersion?: string;
  ipHash?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  acqId?: string;
  plan?: string;
}

export interface AuditExportOptions {
  startDate?: number;
  endDate?: number;
  eventTypes?: ('click' | 'activation' | 'stitched')[];
  includeConsent?: boolean;
}

export interface DashboardData {
  channelCAC: ChannelCAC[];
  topCreatives: CreativePerformance[];
  privacyAlerts: PrivacyAlert[];
  totalClicks: number;
  totalActivations: number;
  overallCAC: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: number;
  version: string;
}