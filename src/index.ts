import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { registerRoutes } from './routes';

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] || 'info',
  },
});

async function start(): Promise<void> {
  try {
    // Security headers
    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    });

    // Rate limiting
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '15 minutes',
      allowList: ['127.0.0.1', '::1'],
    });

    // Stricter rate limit for ingest endpoints
    await app.register(rateLimit, {
      max: 50,
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
      skipOnError: true,
    });

    await registerRoutes(app);

    const port = Number(process.env['PORT']) || 3000;
    const host = process.env['HOST'] || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`Server listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();