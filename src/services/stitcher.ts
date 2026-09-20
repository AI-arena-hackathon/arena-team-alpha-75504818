import { ClickEvent, ActivationEvent, StitchedEvent } from '../types';
import { store } from './store';

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

  // Privacy alerts (simplified)
  const privacyAlerts = [];
  const hasConsentMissing = clicks.some(c => !c.utmSource && !c.acqId);
  if (hasConsentMissing) {
    privacyAlerts.push({
      type: 'consent_missing' as const,
      severity: 'warning' as const,
      message: 'Some clicks lack attribution parameters - verify consent collection',
      affectedRecords: clicks.filter(c => !c.utmSource && !c.acqId).length,
    });
  }

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