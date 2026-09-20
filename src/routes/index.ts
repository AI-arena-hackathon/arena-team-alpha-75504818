import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { store } from '../services/store';
import { stitchEvents, getDashboardData } from '../services/stitcher';
import { ClickEvent, ActivationEvent, HealthResponse } from '../types';

const clickEventSchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().url(),
  timestamp: z.number().int().positive(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  acqId: z.string().optional(),
  referrer: z.string().optional(),
  userAgent: z.string().optional(),
});

const activationEventSchema = z.object({
  userId: z.string().min(1),
  plan: z.string().min(1),
  timestamp: z.number().int().positive(),
  sessionId: z.string().optional(),
  revenue: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health endpoint
  app.get<{ Reply: HealthResponse }>('/health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      version: '0.1.0',
    };
  });

  // Ingest click event from browser extension
  app.post<{ Body: ClickEvent }>('/api/ingest/click', async (request, reply) => {
    const parseResult = clickEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid click event',
        details: parseResult.error.flatten(),
      });
    }

    const click = parseResult.data;
    store.addClick(click);

    return { success: true, sessionId: click.sessionId };
  });

  // Record activation event from server SDK
  app.post<{ Body: ActivationEvent }>('/api/ingest/activation', async (request, reply) => {
    const parseResult = activationEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid activation event',
        details: parseResult.error.flatten(),
      });
    }

    const activation = parseResult.data;
    store.addActivation(activation);

    return { success: true, userId: activation.userId };
  });

  // Dashboard API - returns stitched data and CAC metrics
  app.get('/api/dashboard', async () => {
    stitchEvents(); // Re-stitch on each request for real-time feel
    return getDashboardData();
  });

  // Debug endpoint to see raw data
  app.get('/api/debug/data', async () => {
    return {
      clicks: store.getClicks(),
      activations: store.getActivations(),
      stitched: store.getStitchedEvents(),
    };
  });

  // Reset data (for testing)
  app.post('/api/debug/reset', async () => {
    store.clear();
    return { success: true };
  });
}