import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryStore, store } from '../services/store';
import { stitchEvents, getDashboardData } from '../services/stitcher';
import { ClickEvent, ActivationEvent, PrivacyAlert } from '../types';

describe('InMemoryStore', () => {
  beforeEach(() => {
    store.clear();
  });

  it('should store and retrieve click events', () => {
    const click: ClickEvent = {
      sessionId: 'sess-1',
      url: 'https://example.com/?utm_source=google&utm_medium=cpc',
      timestamp: Date.now(),
      utmSource: 'google',
      utmMedium: 'cpc',
    };

    store.addClick(click);
    const clicks = store.getClicks();

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toEqual(click);
  });

  it('should store and retrieve activation events', () => {
    const activation: ActivationEvent = {
      userId: 'user-1',
      plan: 'pro',
      timestamp: Date.now(),
      sessionId: 'sess-1',
      revenue: 29,
    };

    store.addActivation(activation);
    const activations = store.getActivations();

    expect(activations).toHaveLength(1);
    expect(activations[0]).toEqual(activation);
  });

  it('should filter clicks by sessionId', () => {
    store.addClick({ sessionId: 'sess-1', url: 'https://a.com', timestamp: 1 });
    store.addClick({ sessionId: 'sess-2', url: 'https://b.com', timestamp: 2 });
    store.addClick({ sessionId: 'sess-1', url: 'https://c.com', timestamp: 3 });

    const sess1Clicks = store.getClicksBySessionId('sess-1');
    expect(sess1Clicks).toHaveLength(2);
  });

  it('should export audit data as CSV rows', () => {
    const timestamp = Date.now();
    store.addClick({
      sessionId: 'sess-1',
      url: 'https://example.com/?utm_source=google&utm_medium=cpc&utm_content=creative_a',
      timestamp,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmContent: 'creative_a',
      consentGiven: true,
      consentTimestamp: timestamp - 1000,
      consentVersion: 'v1',
      ipHash: 'abc123',
    });
    store.addActivation({
      userId: 'user-1',
      plan: 'pro',
      timestamp: timestamp + 1000,
      sessionId: 'sess-1',
      revenue: 29,
    });

    stitchEvents();

    const rows = store.exportAuditData({ includeConsent: true });
    expect(rows.length).toBeGreaterThanOrEqual(2); // click + stitched (activation not included without metadata)

    const clickRow = rows.find(r => r.eventType === 'click');
    expect(clickRow).toBeDefined();
    expect(clickRow!.sessionId).toBe('sess-1');
    expect(clickRow!.consentGiven).toBe(true);
    expect(clickRow!.ipHash).toBe('abc123');
  });

  it('should filter audit export by date range', () => {
    const oldTimestamp = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago
    const newTimestamp = Date.now();

    store.addClick({
      sessionId: 'sess-old',
      url: 'https://example.com/?utm_source=google',
      timestamp: oldTimestamp,
      utmSource: 'google',
    });
    store.addClick({
      sessionId: 'sess-new',
      url: 'https://example.com/?utm_source=facebook',
      timestamp: newTimestamp,
      utmSource: 'facebook',
    });

    const rows = store.exportAuditData({
      startDate: newTimestamp - 24 * 60 * 60 * 1000,
      endDate: newTimestamp + 24 * 60 * 60 * 1000,
      eventTypes: ['click'],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe('sess-new');
  });

  it('should filter audit export by event types', () => {
    const timestamp = Date.now();
    store.addClick({ sessionId: 'sess-1', url: 'https://a.com', timestamp, utmSource: 'google' });
    store.addActivation({ userId: 'user-1', plan: 'pro', timestamp: timestamp + 1000, sessionId: 'sess-1', revenue: 29 });

    stitchEvents();

    const clickRows = store.exportAuditData({ eventTypes: ['click'] });
    const activationRows = store.exportAuditData({ eventTypes: ['activation'] });
    const stitchedRows = store.exportAuditData({ eventTypes: ['stitched'] });

    expect(clickRows.every(r => r.eventType === 'click')).toBe(true);
    expect(activationRows.every(r => r.eventType === 'activation')).toBe(true);
    expect(stitchedRows.every(r => r.eventType === 'stitched')).toBe(true);
  });
});

describe('Stitcher', () => {
  beforeEach(() => {
    store.clear();
  });

  it('should deterministically match click and activation by sessionId', () => {
    const timestamp = Date.now();

    store.addClick({
      sessionId: 'sess-1',
      url: 'https://example.com/?utm_source=google',
      timestamp,
      utmSource: 'google',
    });

    store.addActivation({
      userId: 'user-1',
      plan: 'pro',
      timestamp: timestamp + 1000,
      sessionId: 'sess-1',
      revenue: 29,
    });

    const stitched = stitchEvents();

    expect(stitched).toHaveLength(1);
    expect(stitched[0].matchType).toBe('deterministic');
    expect(stitched[0].confidence).toBe(1.0);
    expect(stitched[0].clickEvent.sessionId).toBe('sess-1');
    expect(stitched[0].activationEvent.userId).toBe('user-1');
  });

  it('should not match when sessionId differs', () => {
    const timestamp = Date.now();

    store.addClick({
      sessionId: 'sess-1',
      url: 'https://example.com/?utm_source=google',
      timestamp,
      utmSource: 'google',
    });

    store.addActivation({
      userId: 'user-1',
      plan: 'pro',
      timestamp: timestamp + 1000,
      sessionId: 'sess-2', // Different sessionId
      revenue: 29,
    });

    const stitched = stitchEvents();

    expect(stitched).toHaveLength(0);
  });

  it('should calculate channel CAC correctly', () => {
    const timestamp = Date.now();

    // Google clicks - 2 clicks, 1 activation
    store.addClick({
      sessionId: 'sess-1',
      url: 'https://example.com/?utm_source=google&utm_medium=cpc',
      timestamp,
      utmSource: 'google',
      utmMedium: 'cpc',
    });
    store.addClick({
      sessionId: 'sess-2',
      url: 'https://example.com/?utm_source=google&utm_medium=cpc',
      timestamp,
      utmSource: 'google',
      utmMedium: 'cpc',
    });
    store.addActivation({
      userId: 'user-1',
      plan: 'pro',
      timestamp: timestamp + 1000,
      sessionId: 'sess-1',
      revenue: 29,
    });

    // Facebook clicks - 1 click, 1 activation
    store.addClick({
      sessionId: 'sess-3',
      url: 'https://example.com/?utm_source=facebook&utm_medium=social',
      timestamp,
      utmSource: 'facebook',
      utmMedium: 'social',
    });
    store.addActivation({
      userId: 'user-2',
      plan: 'basic',
      timestamp: timestamp + 2000,
      sessionId: 'sess-3',
      revenue: 9,
    });

    stitchEvents();
    const dashboard = getDashboardData();

    expect(dashboard.channelCAC).toHaveLength(2);

    const googleChannel = dashboard.channelCAC.find(c => c.channel === 'google');
    expect(googleChannel).toBeDefined();
    expect(googleChannel!.clicks).toBe(2);
    expect(googleChannel!.activations).toBe(1);
    expect(googleChannel!.cac).toBe(29);

    const facebookChannel = dashboard.channelCAC.find(c => c.channel === 'facebook');
    expect(facebookChannel).toBeDefined();
    expect(facebookChannel!.clicks).toBe(1);
    expect(facebookChannel!.activations).toBe(1);
    expect(facebookChannel!.cac).toBe(9);
  });

  it('should calculate overall CAC', () => {
    const timestamp = Date.now();

    store.addClick({
      sessionId: 'sess-1',
      url: 'https://example.com/?utm_source=google',
      timestamp,
      utmSource: 'google',
    });
    store.addActivation({
      userId: 'user-1',
      plan: 'pro',
      timestamp: timestamp + 1000,
      sessionId: 'sess-1',
      revenue: 29,
    });

    store.addClick({
      sessionId: 'sess-2',
      url: 'https://example.com/?utm_source=facebook',
      timestamp,
      utmSource: 'facebook',
    });
    store.addActivation({
      userId: 'user-2',
      plan: 'basic',
      timestamp: timestamp + 2000,
      sessionId: 'sess-2',
      revenue: 9,
    });

    stitchEvents();
    const dashboard = getDashboardData();

    expect(dashboard.totalClicks).toBe(2);
    expect(dashboard.totalActivations).toBe(2);
    expect(dashboard.overallCAC).toBe(19); // (29 + 9) / 2
  });

  it('should track top creatives', () => {
    const timestamp = Date.now();

    store.addClick({
      sessionId: 'sess-1',
      url: 'https://example.com/landing1?utm_source=google&utm_content=creative_a',
      timestamp,
      utmSource: 'google',
      utmContent: 'creative_a',
    });
    store.addActivation({
      userId: 'user-1',
      plan: 'pro',
      timestamp: timestamp + 1000,
      sessionId: 'sess-1',
      revenue: 29,
    });

    store.addClick({
      sessionId: 'sess-2',
      url: 'https://example.com/landing1?utm_source=google&utm_content=creative_b',
      timestamp,
      utmSource: 'google',
      utmContent: 'creative_b',
    });
    store.addActivation({
      userId: 'user-2',
      plan: 'pro',
      timestamp: timestamp + 2000,
      sessionId: 'sess-2',
      revenue: 29,
    });

    store.addClick({
      sessionId: 'sess-3',
      url: 'https://example.com/landing1?utm_source=google&utm_content=creative_a',
      timestamp,
      utmSource: 'google',
      utmContent: 'creative_a',
    });
    store.addActivation({
      userId: 'user-3',
      plan: 'pro',
      timestamp: timestamp + 3000,
      sessionId: 'sess-3',
      revenue: 29,
    });

    stitchEvents();
    const dashboard = getDashboardData();

    expect(dashboard.topCreatives).toHaveLength(2);
    expect(dashboard.topCreatives[0].creative).toBe('creative_a');
    expect(dashboard.topCreatives[0].activations).toBe(2);
    expect(dashboard.topCreatives[1].creative).toBe('creative_b');
    expect(dashboard.topCreatives[1].activations).toBe(1);
  });

  describe('Privacy Alerts', () => {
    it('should flag consent_missing when clicks lack consentGiven', () => {
      const timestamp = Date.now();

      store.addClick({
        sessionId: 'sess-1',
        url: 'https://example.com/?utm_source=google',
        timestamp,
        utmSource: 'google',
        consentGiven: false,
      });
      store.addClick({
        sessionId: 'sess-2',
        url: 'https://example.com/?utm_source=facebook',
        timestamp,
        utmSource: 'facebook',
        // consentGiven undefined
      });

      stitchEvents();
      const dashboard = getDashboardData();

      const consentAlert = dashboard.privacyAlerts.find(a => a.type === 'consent_missing');
      expect(consentAlert).toBeDefined();
      expect(consentAlert!.severity).toBe('warning');
      expect(consentAlert!.affectedRecords).toBe(2);
    });

    it('should not flag consent_missing when all clicks have consent', () => {
      const timestamp = Date.now();

      store.addClick({
        sessionId: 'sess-1',
        url: 'https://example.com/?utm_source=google',
        timestamp,
        utmSource: 'google',
        consentGiven: true,
      });
      store.addClick({
        sessionId: 'sess-2',
        url: 'https://example.com/?utm_source=facebook',
        timestamp,
        utmSource: 'facebook',
        consentGiven: true,
      });

      stitchEvents();
      const dashboard = getDashboardData();

      const consentAlert = dashboard.privacyAlerts.find(a => a.type === 'consent_missing');
      expect(consentAlert).toBeUndefined();
    });

    it('should flag data_retention for events older than 90 days', () => {
      const oldTimestamp = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago
      const newTimestamp = Date.now();

      store.addClick({
        sessionId: 'sess-old',
        url: 'https://example.com/?utm_source=google',
        timestamp: oldTimestamp,
        utmSource: 'google',
      });
      store.addClick({
        sessionId: 'sess-new',
        url: 'https://example.com/?utm_source=facebook',
        timestamp: newTimestamp,
        utmSource: 'facebook',
      });
      store.addActivation({
        userId: 'user-old',
        plan: 'pro',
        timestamp: oldTimestamp + 1000,
        sessionId: 'sess-old',
        revenue: 29,
      });

      stitchEvents();
      const dashboard = getDashboardData();

      const retentionAlert = dashboard.privacyAlerts.find(a => a.type === 'data_retention');
      expect(retentionAlert).toBeDefined();
      expect(retentionAlert!.severity).toBe('critical');
      expect(retentionAlert!.affectedRecords).toBe(2); // 1 click + 1 activation
    });

    it('should flag cross_border when referrer TLD differs from click TLD', () => {
      const timestamp = Date.now();

      store.addClick({
        sessionId: 'sess-1',
        url: 'https://example.com/?utm_source=google',
        timestamp,
        utmSource: 'google',
        referrer: 'https://ads.co.uk/campaign', // UK referrer
      });
      store.addClick({
        sessionId: 'sess-2',
        url: 'https://example.com/?utm_source=facebook',
        timestamp,
        utmSource: 'facebook',
        referrer: 'https://social.com/post', // Same TLD (.com)
      });

      stitchEvents();
      const dashboard = getDashboardData();

      const crossBorderAlert = dashboard.privacyAlerts.find(a => a.type === 'cross_border');
      expect(crossBorderAlert).toBeDefined();
      expect(crossBorderAlert!.severity).toBe('warning');
      expect(crossBorderAlert!.affectedRecords).toBe(1);
    });

    it('should flag minors_detected for minor-audience user agents', () => {
      const timestamp = Date.now();

      store.addClick({
        sessionId: 'sess-1',
        url: 'https://example.com/?utm_source=google',
        timestamp,
        utmSource: 'google',
        userAgent: 'Mozilla/5.0 KidsBrowser/1.0',
      });
      store.addClick({
        sessionId: 'sess-2',
        url: 'https://example.com/?utm_source=facebook',
        timestamp,
        utmSource: 'facebook',
        userAgent: 'Mozilla/5.0 RegularBrowser/1.0',
      });

      stitchEvents();
      const dashboard = getDashboardData();

      const minorsAlert = dashboard.privacyAlerts.find(a => a.type === 'minors_detected');
      expect(minorsAlert).toBeDefined();
      expect(minorsAlert!.severity).toBe('critical');
      expect(minorsAlert!.affectedRecords).toBe(1);
    });
  });
});

describe('Health endpoint types', () => {
  it('should have correct health response structure', () => {
    const health = {
      status: 'ok' as const,
      timestamp: Date.now(),
      version: '0.1.0',
    };

    expect(health.status).toBe('ok');
    expect(typeof health.timestamp).toBe('number');
    expect(typeof health.version).toBe('string');
  });
});