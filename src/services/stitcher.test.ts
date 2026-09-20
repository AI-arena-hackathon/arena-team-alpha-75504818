import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryStore, store } from '../services/store';
import { stitchEvents, getDashboardData } from '../services/stitcher';
import { ClickEvent, ActivationEvent } from '../types';

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