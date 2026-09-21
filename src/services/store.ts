import { ClickEvent, ActivationEvent, StitchedEvent, AuditExportRow, AuditExportOptions } from '../types';

export class InMemoryStore {
  private clicks: ClickEvent[] = [];
  private activations: ActivationEvent[] = [];
  private stitched: StitchedEvent[] = [];

  addClick(click: ClickEvent): void {
    this.clicks.push(click);
  }

  addActivation(activation: ActivationEvent): void {
    this.activations.push(activation);
  }

  getClicks(): ClickEvent[] {
    return [...this.clicks];
  }

  getActivations(): ActivationEvent[] {
    return [...this.activations];
  }

  getClicksBySessionId(sessionId: string): ClickEvent[] {
    return this.clicks.filter(c => c.sessionId === sessionId);
  }

  getActivationsByUserId(userId: string): ActivationEvent[] {
    return this.activations.filter(a => a.userId === userId);
  }

  getUnmatchedClicks(): ClickEvent[] {
    const matchedSessionIds = new Set(this.stitched.map(s => s.clickEvent.sessionId));
    return this.clicks.filter(c => !matchedSessionIds.has(c.sessionId));
  }

  getUnmatchedActivations(): ActivationEvent[] {
    const matchedUserIds = new Set(this.stitched.map(s => s.activationEvent.userId));
    return this.activations.filter(a => !matchedUserIds.has(a.userId));
  }

  addStitchedEvent(stitched: StitchedEvent): void {
    this.stitched.push(stitched);
  }

  getStitchedEvents(): StitchedEvent[] {
    return [...this.stitched];
  }

  clearStitched(): void {
    this.stitched = [];
  }

  clear(): void {
    this.clicks = [];
    this.activations = [];
    this.stitched = [];
  }

  exportAuditData(options: AuditExportOptions = {}): AuditExportRow[] {
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

  private extractPath(url: string): string {
    try {
      return new URL(url).pathname || '/';
    } catch {
      return '/';
    }
  }
}

export const store = new InMemoryStore();