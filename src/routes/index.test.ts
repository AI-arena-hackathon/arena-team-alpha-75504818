import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from '../routes';
import { store } from '../services/store';

describe('API Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    store.clear();
    app = Fastify();
    await registerRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(body.version).toBe('0.1.0');
    });
  });

  describe('POST /api/ingest/click', () => {
    it('should accept valid click event', async () => {
      const clickEvent = {
        sessionId: 'sess-1',
        url: 'https://example.com/?utm_source=google&utm_medium=cpc',
        timestamp: Date.now(),
        utmSource: 'google',
        utmMedium: 'cpc',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/click',
        payload: clickEvent,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('sess-1');
    });

    it('should reject invalid click event', async () => {
      const invalidClick = {
        sessionId: '',
        url: 'not-a-url',
        timestamp: 'invalid',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/click',
        payload: invalidClick,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid click event');
    });

    it('should store click event in memory', async () => {
      const clickEvent = {
        sessionId: 'sess-test',
        url: 'https://example.com/?utm_source=twitter',
        timestamp: Date.now(),
        utmSource: 'twitter',
      };

      await app.inject({
        method: 'POST',
        url: '/api/ingest/click',
        payload: clickEvent,
      });

      const clicks = store.getClicks();
      expect(clicks).toHaveLength(1);
      expect(clicks[0].sessionId).toBe('sess-test');
      expect(clicks[0].utmSource).toBe('twitter');
    });
  });

  describe('POST /api/ingest/activation', () => {
    it('should accept valid activation event', async () => {
      const activationEvent = {
        userId: 'user-1',
        plan: 'pro',
        timestamp: Date.now(),
        sessionId: 'sess-1',
        revenue: 29,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/activation',
        payload: activationEvent,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-1');
    });

    it('should reject invalid activation event', async () => {
      const invalidActivation = {
        userId: '',
        plan: '',
        timestamp: 'invalid',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/ingest/activation',
        payload: invalidActivation,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid activation event');
    });

    it('should store activation event in memory', async () => {
      const activationEvent = {
        userId: 'user-test',
        plan: 'basic',
        timestamp: Date.now(),
        revenue: 9,
      };

      await app.inject({
        method: 'POST',
        url: '/api/ingest/activation',
        payload: activationEvent,
      });

      const activations = store.getActivations();
      expect(activations).toHaveLength(1);
      expect(activations[0].userId).toBe('user-test');
      expect(activations[0].plan).toBe('basic');
    });
  });

  describe('GET /api/dashboard', () => {
    it('should return dashboard data structure', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.channelCAC).toBeDefined();
      expect(body.topCreatives).toBeDefined();
      expect(body.privacyAlerts).toBeDefined();
      expect(body.totalClicks).toBeDefined();
      expect(body.totalActivations).toBeDefined();
      expect(body.overallCAC).toBeDefined();
    });

    it('should return calculated CAC after ingesting events', async () => {
      const timestamp = Date.now();

      await app.inject({
        method: 'POST',
        url: '/api/ingest/click',
        payload: {
          sessionId: 'sess-1',
          url: 'https://example.com/?utm_source=google',
          timestamp,
          utmSource: 'google',
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/ingest/activation',
        payload: {
          userId: 'user-1',
          plan: 'pro',
          timestamp: timestamp + 1000,
          sessionId: 'sess-1',
          revenue: 29,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/dashboard',
      });

      const body = JSON.parse(response.body);
      expect(body.totalClicks).toBe(1);
      expect(body.totalActivations).toBe(1);
      expect(body.overallCAC).toBe(29);
      expect(body.channelCAC[0].channel).toBe('google');
      expect(body.channelCAC[0].cac).toBe(29);
    });
  });

  describe('POST /api/debug/reset', () => {
    it('should clear all stored data', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/ingest/click',
        payload: {
          sessionId: 'sess-1',
          url: 'https://example.com/',
          timestamp: Date.now(),
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/debug/reset',
      });

      const clicks = store.getClicks();
      expect(clicks).toHaveLength(0);
    });
  });
});