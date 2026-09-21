export interface ActivationEvent {
  userId: string;
  plan: string;
  timestamp: number;
  sessionId?: string;
  revenue?: number;
  metadata?: Record<string, unknown>;
}

export interface SDKConfig {
  endpoint: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
}

export interface RecordActivationOptions {
  userId: string;
  plan: string;
  timestamp?: number;
  sessionId?: string;
  revenue?: number;
  metadata?: Record<string, unknown>;
}

export interface RecordActivationResult {
  success: boolean;
  userId: string;
  error?: string;
}

export interface SDKInstance {
  recordActivation: (options: RecordActivationOptions) => Promise<RecordActivationResult>;
  configure: (config: Partial<SDKConfig>) => void;
  getConfig: () => SDKConfig;
}