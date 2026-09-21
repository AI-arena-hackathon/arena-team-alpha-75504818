import { ClickEvent, ActivationEvent, StitchedEvent, AuditExportRow, AuditExportOptions } from '../types';

export interface StorageBackend {
  addClick(click: ClickEvent): Promise<void>;
  addActivation(activation: ActivationEvent): Promise<void>;
  getClicks(): Promise<ClickEvent[]>;
  getActivations(): Promise<ActivationEvent[]>;
  getClicksBySessionId(sessionId: string): Promise<ClickEvent[]>;
  getActivationsByUserId(userId: string): Promise<ActivationEvent[]>;
  getUnmatchedClicks(): Promise<ClickEvent[]>;
  getUnmatchedActivations(): Promise<ActivationEvent[]>;
  addStitchedEvent(stitched: StitchedEvent): Promise<void>;
  getStitchedEvents(): Promise<StitchedEvent[]>;
  clearStitched(): Promise<void>;
  clear(): Promise<void>;
  exportAuditData(options: AuditExportOptions): Promise<AuditExportRow[]>;
  close(): Promise<void>;
}

export class InMemoryStorage implements StorageBackend {
  private clicks: ClickEvent[] = [];
  private activations: ActivationEvent[] = [];
  private stitched: StitchedEvent[] = [];

  async addClick(click: ClickEvent): Promise<void> {
    this.clicks.push(click);
  }

  async addActivation(activation: ActivationEvent): Promise<void> {
    this.activations.push(activation);
  }

  async getClicks(): Promise<ClickEvent[]> {
    return [...this.clicks];
  }

  async getActivations(): Promise<ActivationEvent[]> {
    return [...this.activations];
  }

  async getClicksBySessionId(sessionId: string): Promise<ClickEvent[]> {
    return this.clicks.filter(c => c.sessionId === sessionId);
  }

  async getActivationsByUserId(userId: string): Promise<ActivationEvent[]> {
    return this.activations.filter(a => a.userId === userId);
  }

  async getUnmatchedClicks(): Promise<ClickEvent[]> {
    const matchedSessionIds = new Set(this.stitched.map(s => s.clickEvent.sessionId));
    return this.clicks.filter(c => !matchedSessionIds.has(c.sessionId));
  }

  async getUnmatchedActivations(): Promise<ActivationEvent[]> {
    const matchedUserIds = new Set(this.stitched.map(s => s.activationEvent.userId));
    return this.activations.filter(a => !matchedUserIds.has(a.userId));
  }

  async addStitchedEvent(stitched: StitchedEvent): Promise<void> {
    this.stitched.push(stitched);
  }

  async getStitchedEvents(): Promise<StitchedEvent[]> {
    return [...this.stitched];
  }

  async clearStitched(): Promise<void> {
    this.stitched = [];
  }

  async clear(): Promise<void> {
    this.clicks = [];
    this.activations = [];
    this.stitched = [];
  }

  async exportAuditData(options: AuditExportOptions = {}): Promise<AuditExportRow[]> {
    const { startDate, endDate, eventTypes = ['click', 'activation', 'stitched'], includeConsent = true } = options;
    const rows: AuditExportRow[] = [];

    const start = startDate ?? 0;
    const end = endDate ?? Date.now();

    const filterByDate = (timestamp: number) => timestamp >= start && timestamp <= end;

    if (eventTypes.includes('click')) {
      for (const click of this.clicks) {
        if (!filterByDate(click.timestamp)) continue;
        rows.push({
          eventType: 'click',
          sessionId: click.sessionId,
          timestamp: click.timestamp,
          channel: click.utmSource,
          creative: click.utmContent,
          landingPage: this.extractPath(click.url),
          consentGiven: includeConsent ? click.consentGiven : undefined,
          consentTimestamp: includeConsent ? click.consentTimestamp : undefined,
          consentVersion: includeConsent ? click.consentVersion : undefined,
          ipHash: includeConsent ? click.ipHash : undefined,
          utmSource: click.utmSource,
          utmMedium: click.utmMedium,
          utmCampaign: click.utmCampaign,
          utmContent: click.utmContent,
          utmTerm: click.utmTerm,
          acqId: click.acqId,
        });
      }
    }

    if (eventTypes.includes('activation')) {
      for (const activation of this.activations) {
        if (!filterByDate(activation.timestamp)) continue;
        const meta = activation.metadata as Record<string, string | undefined> | undefined;
        rows.push({
          eventType: 'activation',
          userId: activation.userId,
          sessionId: activation.sessionId,
          timestamp: activation.timestamp,
          revenue: activation.revenue,
          plan: activation.plan,
          utmSource: meta?.['utmSource'],
          utmMedium: meta?.['utmMedium'],
          utmCampaign: meta?.['utmCampaign'],
        });
      }
    }

    if (eventTypes.includes('stitched')) {
      for (const stitched of this.stitched) {
        if (!filterByDate(stitched.clickEvent.timestamp)) continue;
        rows.push({
          eventType: 'stitched',
          sessionId: stitched.clickEvent.sessionId,
          userId: stitched.activationEvent.userId,
          timestamp: stitched.clickEvent.timestamp,
          channel: stitched.clickEvent.utmSource,
          creative: stitched.clickEvent.utmContent,
          landingPage: this.extractPath(stitched.clickEvent.url),
          revenue: stitched.activationEvent.revenue,
          matchType: stitched.matchType,
          confidence: stitched.confidence,
          consentGiven: includeConsent ? stitched.clickEvent.consentGiven : undefined,
          consentTimestamp: includeConsent ? stitched.clickEvent.consentTimestamp : undefined,
          consentVersion: includeConsent ? stitched.clickEvent.consentVersion : undefined,
          ipHash: includeConsent ? stitched.clickEvent.ipHash : undefined,
          utmSource: stitched.clickEvent.utmSource,
          utmMedium: stitched.clickEvent.utmMedium,
          utmCampaign: stitched.clickEvent.utmCampaign,
          utmContent: stitched.clickEvent.utmContent,
          utmTerm: stitched.clickEvent.utmTerm,
          acqId: stitched.clickEvent.acqId,
          plan: stitched.activationEvent.plan,
        });
      }
    }

    return rows.sort((a, b) => a.timestamp - b.timestamp);
  }

  async close(): Promise<void> {
    // No-op for in-memory storage
  }

  private extractPath(url: string): string {
    try {
      return new URL(url).pathname || '/';
    } catch {
      return '/';
    }
  }
}

export class DynamoDBStorage implements StorageBackend {
  private docClient: any;
  private clicksTable: string;
  private activationsTable: string;
  private stitchedTable: string;

  constructor(docClient: any, tablePrefix: string = 'acquisition-signal') {
    this.docClient = docClient;
    this.clicksTable = `${tablePrefix}-clicks`;
    this.activationsTable = `${tablePrefix}-activations`;
    this.stitchedTable = `${tablePrefix}-stitched`;
  }

  async addClick(click: ClickEvent): Promise<void> {
    await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).PutCommand({
      TableName: this.clicksTable,
      Item: {
        pk: `CLICK#${click.sessionId}`,
        sk: `TS#${click.timestamp}`,
        ...click,
        gsi1pk: click.utmSource || 'direct',
        gsi1sk: `TS#${click.timestamp}`,
      },
    }));
  }

  async addActivation(activation: ActivationEvent): Promise<void> {
    await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).PutCommand({
      TableName: this.activationsTable,
      Item: {
        pk: `ACTIVATION#${activation.userId}`,
        sk: `TS#${activation.timestamp}`,
        ...activation,
        gsi1pk: activation.sessionId || 'unknown',
        gsi1sk: `TS#${activation.timestamp}`,
      },
    }));
  }

  async getClicks(): Promise<ClickEvent[]> {
    const result = await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).ScanCommand({
      TableName: this.clicksTable,
    }));
    return (result.Items || []).map((item: any) => {
      const { pk, sk, gsi1pk, gsi1sk, ...click } = item;
      return click as ClickEvent;
    });
  }

  async getActivations(): Promise<ActivationEvent[]> {
    const result = await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).ScanCommand({
      TableName: this.activationsTable,
    }));
    return (result.Items || []).map((item: any) => {
      const { pk, sk, gsi1pk, gsi1sk, ...activation } = item;
      return activation as ActivationEvent;
    });
  }

  async getClicksBySessionId(sessionId: string): Promise<ClickEvent[]> {
    const result = await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).QueryCommand({
      TableName: this.clicksTable,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `CLICK#${sessionId}` },
    }));
    return (result.Items || []).map((item: any) => {
      const { pk, sk, gsi1pk, gsi1sk, ...click } = item;
      return click as ClickEvent;
    });
  }

  async getActivationsByUserId(userId: string): Promise<ActivationEvent[]> {
    const result = await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).QueryCommand({
      TableName: this.activationsTable,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `ACTIVATION#${userId}` },
    }));
    return (result.Items || []).map((item: any) => {
      const { pk, sk, gsi1pk, gsi1sk, ...activation } = item;
      return activation as ActivationEvent;
    });
  }

  async getUnmatchedClicks(): Promise<ClickEvent[]> {
    const [clicks, stitched] = await Promise.all([this.getClicks(), this.getStitchedEvents()]);
    const matchedSessionIds = new Set(stitched.map(s => s.clickEvent.sessionId));
    return clicks.filter(c => !matchedSessionIds.has(c.sessionId));
  }

  async getUnmatchedActivations(): Promise<ActivationEvent[]> {
    const [activations, stitched] = await Promise.all([this.getActivations(), this.getStitchedEvents()]);
    const matchedUserIds = new Set(stitched.map(s => s.activationEvent.userId));
    return activations.filter(a => !matchedUserIds.has(a.userId));
  }

  async addStitchedEvent(stitched: StitchedEvent): Promise<void> {
    await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).PutCommand({
      TableName: this.stitchedTable,
      Item: {
        pk: `STITCHED#${stitched.clickEvent.sessionId}`,
        sk: `TS#${stitched.clickEvent.timestamp}`,
        clickEvent: stitched.clickEvent,
        activationEvent: stitched.activationEvent,
        matchType: stitched.matchType,
        confidence: stitched.confidence,
      },
    }));
  }

  async getStitchedEvents(): Promise<StitchedEvent[]> {
    const result = await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).ScanCommand({
      TableName: this.stitchedTable,
    }));
    return (result.Items || []).map((item: any) => ({
      clickEvent: item.clickEvent,
      activationEvent: item.activationEvent,
      matchType: item.matchType,
      confidence: item.confidence,
    }));
  }

  async clearStitched(): Promise<void> {
    const result = await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).ScanCommand({
      TableName: this.stitchedTable,
      ProjectionExpression: 'pk, sk',
    }));
    if (result.Items && result.Items.length > 0) {
      const deleteRequests = result.Items.map((item: any) => ({
        DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
      }));
      await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).BatchWriteCommand({
        RequestItems: { [this.stitchedTable]: deleteRequests },
      }));
    }
  }

  async clear(): Promise<void> {
    await this.clearStitched();
    const tables = [this.clicksTable, this.activationsTable];
    for (const table of tables) {
      const result = await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).ScanCommand({
        TableName: table,
        ProjectionExpression: 'pk, sk',
      }));
      if (result.Items && result.Items.length > 0) {
        const deleteRequests = result.Items.map((item: any) => ({
          DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
        }));
        await this.docClient.send(new (await import('@aws-sdk/lib-dynamodb')).BatchWriteCommand({
          RequestItems: { [table]: deleteRequests },
        }));
      }
    }
  }

  async exportAuditData(options: AuditExportOptions = {}): Promise<AuditExportRow[]> {
    const [clicks, activations, stitched] = await Promise.all([
      this.getClicks(),
      this.getActivations(),
      this.getStitchedEvents(),
    ]);

    const { startDate, endDate, eventTypes = ['click', 'activation', 'stitched'], includeConsent = true } = options;
    const rows: AuditExportRow[] = [];

    const start = startDate ?? 0;
    const end = endDate ?? Date.now();
    const filterByDate = (timestamp: number) => timestamp >= start && timestamp <= end;

    if (eventTypes.includes('click')) {
      for (const click of clicks) {
        if (!filterByDate(click.timestamp)) continue;
        rows.push({
          eventType: 'click',
          sessionId: click.sessionId,
          timestamp: click.timestamp,
          channel: click.utmSource,
          creative: click.utmContent,
          landingPage: this.extractPath(click.url),
          consentGiven: includeConsent ? click.consentGiven : undefined,
          consentTimestamp: includeConsent ? click.consentTimestamp : undefined,
          consentVersion: includeConsent ? click.consentVersion : undefined,
          ipHash: includeConsent ? click.ipHash : undefined,
          utmSource: click.utmSource,
          utmMedium: click.utmMedium,
          utmCampaign: click.utmCampaign,
          utmContent: click.utmContent,
          utmTerm: click.utmTerm,
          acqId: click.acqId,
        });
      }
    }

    if (eventTypes.includes('activation')) {
      for (const activation of activations) {
        if (!filterByDate(activation.timestamp)) continue;
        const meta = activation.metadata as Record<string, string | undefined> | undefined;
        rows.push({
          eventType: 'activation',
          userId: activation.userId,
          sessionId: activation.sessionId,
          timestamp: activation.timestamp,
          revenue: activation.revenue,
          plan: activation.plan,
          utmSource: meta?.['utmSource'],
          utmMedium: meta?.['utmMedium'],
          utmCampaign: meta?.['utmCampaign'],
        });
      }
    }

    if (eventTypes.includes('stitched')) {
      for (const s of stitched) {
        if (!filterByDate(s.clickEvent.timestamp)) continue;
        rows.push({
          eventType: 'stitched',
          sessionId: s.clickEvent.sessionId,
          userId: s.activationEvent.userId,
          timestamp: s.clickEvent.timestamp,
          channel: s.clickEvent.utmSource,
          creative: s.clickEvent.utmContent,
          landingPage: this.extractPath(s.clickEvent.url),
          revenue: s.activationEvent.revenue,
          matchType: s.matchType,
          confidence: s.confidence,
          consentGiven: includeConsent ? s.clickEvent.consentGiven : undefined,
          consentTimestamp: includeConsent ? s.clickEvent.consentTimestamp : undefined,
          consentVersion: includeConsent ? s.clickEvent.consentVersion : undefined,
          ipHash: includeConsent ? s.clickEvent.ipHash : undefined,
          utmSource: s.clickEvent.utmSource,
          utmMedium: s.clickEvent.utmMedium,
          utmCampaign: s.clickEvent.utmCampaign,
          utmContent: s.clickEvent.utmContent,
          utmTerm: s.clickEvent.utmTerm,
          acqId: s.clickEvent.acqId,
          plan: s.activationEvent.plan,
        });
      }
    }

    return rows.sort((a, b) => a.timestamp - b.timestamp);
  }

  async close(): Promise<void> {
    // No-op for DynamoDB
  }

  private extractPath(url: string): string {
    try {
      return new URL(url).pathname || '/';
    } catch {
      return '/';
    }
  }
}

let storageInstance: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (!storageInstance) {
    storageInstance = new InMemoryStorage();
  }
  return storageInstance;
}

export function setStorage(storage: StorageBackend): void {
  storageInstance = storage;
}

export async function initializeStorage(config?: { type: 'memory' | 'dynamodb'; docClient?: any; tablePrefix?: string }): Promise<StorageBackend> {
  if (config?.type === 'dynamodb' && config.docClient) {
    storageInstance = new DynamoDBStorage(config.docClient, config.tablePrefix);
  } else {
    storageInstance = new InMemoryStorage();
  }
  return storageInstance;
}