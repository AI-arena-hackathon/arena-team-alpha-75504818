import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { store } from '../services/store';
import { stitchEvents, getDashboardData } from '../services/stitcher';
import { ClickEvent, ActivationEvent, HealthResponse, AuditExportOptions, AuditExportRow } from '../types';

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
  ipHash: z.string().optional(),
  consentGiven: z.boolean().optional(),
  consentTimestamp: z.number().int().positive().optional(),
  consentVersion: z.string().optional(),
});

const activationEventSchema = z.object({
  userId: z.string().min(1),
  plan: z.string().min(1),
  timestamp: z.number().int().positive(),
  sessionId: z.string().optional(),
  revenue: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const auditExportQuerySchema = z.object({
  startDate: z.coerce.number().int().positive().optional(),
  endDate: z.coerce.number().int().positive().optional(),
  eventTypes: z.string().optional(), // comma-separated: click,activation,stitched
  includeConsent: z.coerce.boolean().optional(),
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
    await stitchEvents(); // Re-stitch on each request for real-time feel
    return getDashboardData();
  });

  // Audit CSV Export endpoint
  app.get<{ Querystring: AuditExportOptions }>('/api/audit/export', async (request, reply) => {
    const parseResult = auditExportQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid export parameters',
        details: parseResult.error.flatten(),
      });
    }

    const { startDate, endDate, eventTypes, includeConsent } = parseResult.data;
    const validTypes = ['click', 'activation', 'stitched'] as const;
    let types: ('click' | 'activation' | 'stitched')[] = ['click', 'activation', 'stitched'];
    if (eventTypes) {
      types = eventTypes.split(',').map(t => t.trim()).filter(t => validTypes.includes(t as any)) as ('click' | 'activation' | 'stitched')[];
    }

    const rows = await store.exportAuditDataAsync({ startDate, endDate, eventTypes: types, includeConsent });

    // Generate CSV
    const headers = [
      'eventType', 'sessionId', 'userId', 'timestamp', 'channel', 'creative', 'landingPage',
      'revenue', 'matchType', 'confidence', 'consentGiven', 'consentTimestamp', 'consentVersion',
      'ipHash', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'acqId', 'plan'
    ];

    const csvRows = rows.map(row => [
      row.eventType,
      row.sessionId || '',
      row.userId || '',
      row.timestamp.toString(),
      row.channel || '',
      row.creative || '',
      row.landingPage || '',
      row.revenue?.toString() || '',
      row.matchType || '',
      row.confidence?.toString() || '',
      row.consentGiven?.toString() || '',
      row.consentTimestamp?.toString() || '',
      row.consentVersion || '',
      row.ipHash || '',
      row.utmSource || '',
      row.utmMedium || '',
      row.utmCampaign || '',
      row.utmContent || '',
      row.utmTerm || '',
      row.acqId || '',
      row.plan || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="audit-export-${Date.now()}.csv"`);
    return csv;
  });

  // Debug endpoint to see raw data
  app.get('/api/debug/data', async () => {
    return {
      clicks: await store.getClicksAsync(),
      activations: await store.getActivationsAsync(),
      stitched: await store.getStitchedEventsAsync(),
    };
  });

  // Reset data (for testing)
  app.post('/api/debug/reset', async () => {
    await store.clearAsync();
    return { success: true };
  });
}