import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { configure, getConfig, recordActivation, SDKConfig } from './index';

const originalFetch = global.fetch;

describe('Acquisition Signal SDK', () => {
  beforeEach(() => {
    configure({
      endpoint: 'http://localhost:3000/api/ingest/activation',
      timeout: 5000,
      retries: 3,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  describe('Configuration', () => {
    it('should return default config when not configured', () => {
      const cfg = getConfig();
      expect(cfg.endpoint).toBe('http://localhost:3000/api/ingest/activation');
      expect(cfg.timeout).toBe(5000);
      expect(cfg.retries).toBe(3);
    });

    it('should update config with configure()', () => {
      configure({ endpoint: 'https://api.example.com/ingest', apiKey: 'test-key' });
      const cfg = getConfig();
      expect(cfg.endpoint).toBe('https://api.example.com/ingest');
      expect(cfg.apiKey).toBe('test-key');
    });

    it('should merge partial config', () => {
      configure({ timeout: 10000 });
      const cfg = getConfig();
      expect(cfg.timeout).toBe(10000);
      expect(cfg.endpoint).toBe('http://localhost:3000/api/ingest/activation');
      expect(cfg.retries).toBe(3);
    });
  });

  describe('recordActivation', () => {
    it('should send activation event and return success', async () => {
      const mockResponse = { success: true, userId: 'user-1' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await recordActivation({
        userId: 'user-1',
        plan: 'pro',
        timestamp: 1700000000000,
        sessionId: 'sess-1',
        revenue: 29,
      });

      expect(result).toEqual({ success: true, userId: 'user-1' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/ingest/activation',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'user-1',
            plan: 'pro',
            timestamp: 1700000000000,
            sessionId: 'sess-1',
            revenue: 29,
          }),
        })
      );
    });

    it('should include API key in headers when configured', async () => {
      configure({ apiKey: 'secret-key' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, userId: 'user-1' }),
      });

      await recordActivation({ userId: 'user-1', plan: 'pro' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer secret-key',
          }),
        })
      );
    });

    it('should return error when response is not ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid activation event' }),
      });

      const result = await recordActivation({ userId: 'user-1', plan: 'pro' });

      expect(result).toEqual({
        success: false,
        userId: 'user-1',
        error: 'Invalid activation event',
      });
    });

    it('should return error when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await recordActivation({ userId: 'user-1', plan: 'pro' });

      expect(result).toEqual({
        success: false,
        userId: 'user-1',
        error: 'Network error',
      });
    });

    it('should retry on timeout', async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('AbortError'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, userId: 'user-1' }),
        });
      });

      const promise = recordActivation({ userId: 'user-1', plan: 'pro' });

      await vi.advanceTimersByTimeAsync(3000);
      const result = await promise;

      expect(attempts).toBe(3);
      expect(result.success).toBe(true);
    });

    it('should use default timestamp when not provided', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, userId: 'user-1' }),
      });

      await recordActivation({ userId: 'user-1', plan: 'pro' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(
            expect.objectContaining({ timestamp: now })
          ),
        })
      );
    });

    it('should omit optional fields when not provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, userId: 'user-1' }),
      });

      await recordActivation({ userId: 'user-1', plan: 'pro' });

      const callBody = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(callBody).not.toHaveProperty('sessionId');
      expect(callBody).not.toHaveProperty('revenue');
      expect(callBody).not.toHaveProperty('metadata');
    });

    it('should include metadata when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, userId: 'user-1' }),
      });

      await recordActivation({
        userId: 'user-1',
        plan: 'pro',
        metadata: { source: 'webhook', campaign: 'summer-sale' },
      });

      const callBody = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(callBody.metadata).toEqual({ source: 'webhook', campaign: 'summer-sale' });
    });
  });
});