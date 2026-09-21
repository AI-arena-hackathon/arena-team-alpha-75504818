import { ClickEvent, ActivationEvent, StitchedEvent, PrivacyAlert } from '../types';
import { store } from './store';

const DATA_RETENTION_DAYS = 90;
const MINORS_AGE_THRESHOLD = 16;

function extractUtmParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
      if (key.startsWith('utm_') || key === 'acq_id') {
        params[key] = value;
      }
    });
  } catch {
    // Invalid URL, ignore
  }
  return params;
}

function generateFingerprint(click: ClickEvent): string {
  const parts = [
    click.userAgent || '',
    click.referrer || '',
    click.utmSource || '',
    click.utmMedium || '',
    click.utmCampaign || '',
  ];
  return parts.join('|');
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function detectCrossBorderRisk(click: ClickEvent): boolean {
  // Simplified: flag if referrer suggests cross-border (e.g., different TLD)
  if (!click.referrer) return false;
  try {
    const referrerHost = new URL(click.referrer).hostname;
    const clickHost = new URL(click.url).hostname;
    const referrerTld = referrerHost.split('.').pop() || '';
    const clickTld = clickHost.split('.').pop() || '';
    return referrerTld !== clickTld && referrerTld !== '' && clickTld !== '';
  } catch {
    return false;
  }
}

function detectMinorsRisk(click: ClickEvent): boolean {
  // Simplified: check user agent for minor-indicating patterns or metadata
  // In production, this would integrate with age verification services
  const ua = (click.userAgent || '').toLowerCase();
  const minorPatterns = ['kids', 'children', 'family', 'parental', 'age_gate'];
  return minorPatterns.some(p => ua.includes(p));
}

export function stitchEvents(): StitchedEvent[] {
  store.clearStitched();
  const clicks = store.getClicks();
  const activations = store.getActivations();
  const stitched: StitchedEvent[] = [];
  const matchedClickIds = new Set<string>();
  const matchedActivationIds = new Set<string>();

  // First pass: deterministic matching on sessionId
  for (const click of clicks) {
    if (matchedClickIds.has(click.sessionId)) continue;

    const matchingActivation = activations.find(
      a => a.sessionId === click.sessionId && !matchedActivationIds.has(a.userId)
    );

    if (matchingActivation) {
      stitched.push({
        clickEvent: click,
        activationEvent: matchingActivation,
        matchType: 'deterministic',
        confidence: 1.0,
      });
      matchedClickIds.add(click.sessionId);
      matchedActivationIds.add(matchingActivation.userId);
    }
  }

  // Second pass: probabilistic matching on fingerprint
  const unmatchedClicks = clicks.filter(c => !matchedClickIds.has(c.sessionId));
  const unmatchedActivations = activations.filter(a => !matchedActivationIds.has(a.userId));

  for (const activation of unmatchedActivations) {
    // For probabilistic matching, require matching UTM params AND time proximity
    const meta = activation.metadata as Record<string, string | undefined> | undefined;
    const candidateClicks = unmatchedClicks.filter(c => {
      const timeDiff = Math.abs(c.timestamp - activation.timestamp);
      const utmMatch = 
        c.utmSource === meta?.['utmSource'] &&
        c.utmMedium === meta?.['utmMedium'] &&
        c.utmCampaign === meta?.['utmCampaign'];
      return timeDiff < 24 * 60 * 60 * 1000 && utmMatch; // Within 24 hours AND matching UTM
    });

    if (candidateClicks.length === 1) {
      const click = candidateClicks[0]!;
      stitched.push({
        clickEvent: click,
        activationEvent: activation,
        matchType: 'probabilistic',
        confidence: 0.7,
      });
      matchedClickIds.add(click.sessionId);
      matchedActivationIds.add(activation.userId);
    }
  }

  // Store stitched events
  for (const s of stitched) {
    store.addStitchedEvent(s);
  }

  return stitched;
}

function generatePrivacyAlerts(clicks: ClickEvent[], activations: ActivationEvent[], stitched: StitchedEvent[]): PrivacyAlert[] {
  const alerts: PrivacyAlert[] = [];
  const now = Date.now();
  const retentionMs = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  // 1. Consent missing alert
  const clicksWithoutConsent = clicks.filter(c => !c.consentGiven);
  if (clicksWithoutConsent.length > 0) {
    alerts.push({
      type: 'consent_missing',
      severity: 'warning',
      message: `${clicksWithoutConsent.length} click events lack explicit consent - verify consent collection flow`,
      affectedRecords: clicksWithoutConsent.length,
    });
  }

  // 2. Data retention alert
  const expiredClicks = clicks.filter(c => now - c.timestamp > retentionMs);
  const expiredActivations = activations.filter(a => now - a.timestamp > retentionMs);
  const totalExpired = expiredClicks.length + expiredActivations.length;
  if (totalExpired > 0) {
    alerts.push({
      type: 'data_retention',
      severity: 'critical',
      message: `${totalExpired} events exceed ${DATA_RETENTION_DAYS}-day retention policy - schedule deletion`,
      affectedRecords: totalExpired,
    });
  }

  // 3. Cross-border transfer risk
  const crossBorderClicks = clicks.filter(detectCrossBorderRisk);
  if (crossBorderClicks.length > 0) {
    alerts.push({
      type: 'cross_border',
      severity: 'warning',
      message: `${crossBorderClicks.length} clicks have cross-border referrer origins - verify SCC/adequacy decisions`,
      affectedRecords: crossBorderClicks.length,
    });
  }

  // 4. Minors detected risk
  const minorRiskClicks = clicks.filter(detectMinorsRisk);
  if (minorRiskClicks.length > 0) {
    alerts.push({
      type: 'minors_detected',
      severity: 'critical',
      message: `${minorRiskClicks.length} clicks from potential minor-audience contexts - verify COPPA/GDPR-K compliance`,
      affectedRecords: minorRiskClicks.length,
    });
  }

  return alerts;
}

export function getDashboardData() {
  const stitched = store.getStitchedEvents();
  const clicks = store.getClicks();
  const activations = store.getActivations();

  // Channel CAC calculation
  const channelMap = new Map<string, { clicks: number; activations: number; revenue: number }>();

  for (const s of stitched) {
    const channel = s.clickEvent.utmSource || 'direct';
    const existing = channelMap.get(channel) || { clicks: 0, activations: 0, revenue: 0 };
    existing.clicks += 1;
    existing.activations += 1;
    existing.revenue += s.activationEvent.revenue || 0;
    channelMap.set(channel, existing);
  }

  // Also count unmatched clicks per channel
  for (const click of clicks) {
    const channel = click.utmSource || 'direct';
    const existing = channelMap.get(channel) || { clicks: 0, activations: 0, revenue: 0 };
    // Only increment clicks if not already counted in stitched
    const isStitched = stitched.some(s => s.clickEvent.sessionId === click.sessionId);
    if (!isStitched) {
      existing.clicks += 1;
    }
    channelMap.set(channel, existing);
  }

  const channelCAC = Array.from(channelMap.entries()).map(([channel, data]) => ({
    channel,
    clicks: data.clicks,
    activations: data.activations,
    cac: data.activations > 0 ? data.revenue / data.activations : 0,
    revenue: data.revenue,
  }));

  // Top creatives
  const creativeMap = new Map<string, { clicks: number; activations: number; revenue: number }>();

  for (const s of stitched) {
    const creative = s.clickEvent.utmContent || 'unknown';
    const landing = new URL(s.clickEvent.url).pathname || '/';
    const key = `${creative}|${landing}`;
    const existing = creativeMap.get(key) || { clicks: 0, activations: 0, revenue: 0 };
    existing.clicks += 1;
    existing.activations += 1;
    existing.revenue += s.activationEvent.revenue || 0;
    creativeMap.set(key, existing);
  }

  const topCreatives = Array.from(creativeMap.entries())
    .map(([key, data]) => {
      const [creative, landingPage] = key.split('|');
      return {
        creative,
        landingPage,
        clicks: data.clicks,
        activations: data.activations,
        cac: data.activations > 0 ? data.revenue / data.activations : 0,
        conversionRate: data.clicks > 0 ? data.activations / data.clicks : 0,
      };
    })
    .sort((a, b) => b.activations - a.activations)
    .slice(0, 10);

  // Enhanced privacy alerts
  const privacyAlerts = generatePrivacyAlerts(clicks, activations, stitched);

  const totalClicks = clicks.length;
  const totalActivations = activations.length;
  const overallRevenue = stitched.reduce((sum, s) => sum + (s.activationEvent.revenue || 0), 0);
  const overallCAC = totalActivations > 0 ? overallRevenue / totalActivations : 0;

  return {
    channelCAC,
    topCreatives,
    privacyAlerts,
    totalClicks,
    totalActivations,
    overallCAC,
  };
}