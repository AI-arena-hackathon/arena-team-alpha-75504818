import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateSessionId,
  extractUtmParams,
  isSessionExpired,
} from '../extension/src/utils';

describe('Extension Utils', () => {
  describe('generateSessionId', () => {
    it('should generate a unique session ID', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).toMatch(/^sess_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^sess_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('extractUtmParams', () => {
    it('should extract UTM parameters from URL', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale&utm_content=banner_a&utm_term=running_shoes';
      const params = extractUtmParams(url);

      expect(params.utmSource).toBe('google');
      expect(params.utmMedium).toBe('cpc');
      expect(params.utmCampaign).toBe('summer_sale');
      expect(params.utmContent).toBe('banner_a');
      expect(params.utmTerm).toBe('running_shoes');
    });

    it('should extract acq_id parameter', () => {
      const url = 'https://example.com/page?acq_id=custom123';
      const params = extractUtmParams(url);

      expect(params.acqId).toBe('custom123');
    });

    it('should handle URLs without UTM parameters', () => {
      const url = 'https://example.com/page';
      const params = extractUtmParams(url);

      expect(params).toEqual({});
    });

    it('should handle invalid URLs gracefully', () => {
      const url = 'not-a-valid-url';
      const params = extractUtmParams(url);

      expect(params).toEqual({});
    });

    it('should ignore non-UTM parameters', () => {
      const url = 'https://example.com/page?utm_source=google&custom_param=value&other=test';
      const params = extractUtmParams(url);

      expect(params.utmSource).toBe('google');
      expect((params as Record<string, string>).custom_param).toBeUndefined();
    });
  });

  describe('isSessionExpired', () => {
    it('should return true for expired sessions', () => {
      const session = { sessionId: 'sess-1', createdAt: Date.now() - 100000, lastActivity: Date.now() - 100000 };
      const timeoutMs = 50000;

      expect(isSessionExpired(session, timeoutMs)).toBe(true);
    });

    it('should return false for active sessions', () => {
      const session = { sessionId: 'sess-1', createdAt: Date.now() - 10000, lastActivity: Date.now() - 1000 };
      const timeoutMs = 50000;

      expect(isSessionExpired(session, timeoutMs)).toBe(false);
    });

    it('should handle boundary condition (exactly at timeout)', () => {
      const now = Date.now();
      const session = { sessionId: 'sess-1', createdAt: now - 50000, lastActivity: now - 50000 };
      const timeoutMs = 50000;

      // At exactly the timeout boundary, it should be expired (>) not (>=)
      // Since we use > in the implementation, exactly at timeout is NOT expired
      // But we're testing with a fixed timestamp, so we control the "now"
      expect(isSessionExpired(session, timeoutMs)).toBe(false);
    });

    it('should return true for sessions past the timeout', () => {
      const now = Date.now();
      const session = { sessionId: 'sess-1', createdAt: now - 50001, lastActivity: now - 50001 };
      const timeoutMs = 50000;

      expect(isSessionExpired(session, timeoutMs)).toBe(true);
    });
  });
});