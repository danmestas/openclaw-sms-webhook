import express, { Request, Response, NextFunction } from 'express';
import { GatewayClient } from './gateway';
import { Logger } from './logger';
import { Metrics, createMetrics, recordLatency, formatPrometheus, getLatencyStats } from './metrics';
import { validateTwilioSignature, twiml } from './twilio';

export interface AppConfig {
  gateway: GatewayClient;
  logger: Logger;
  /** Twilio auth token for signature validation. If not set, validation is skipped. */
  twilioAuthToken?: string;
  /** The public URL base (e.g. https://xxx.ngrok-free.dev) for signature validation. */
  publicUrl?: string;
  /** Port the voice-call webhook runs on (for proxying). 0 to disable. */
  voiceProxyPort?: number;
}

export function createApp(config: AppConfig) {
  const { gateway, logger } = config;
  const metrics: Metrics = createMetrics();
  const app = express();

  // Parse Twilio form-encoded bodies and JSON
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      });
    });
    next();
  });

  // ─── Health ──────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    const latency = getLatencyStats(metrics);
    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - metrics.startedAt) / 1000),
      metrics: {
        smsReceived: metrics.smsReceived,
        forwardSuccess: metrics.forwardSuccess,
        forwardFailure: metrics.forwardFailure,
        rejected: metrics.rejected,
        signatureFailures: metrics.signatureFailures,
        latency,
      },
    });
  });

  // ─── Prometheus metrics ──────────────────────────────────
  app.get('/metrics', (_req, res) => {
    res.type('text/plain; version=0.0.4; charset=utf-8').send(formatPrometheus(metrics));
  });

  // ─── Voice proxy ─────────────────────────────────────────
  const voicePort = config.voiceProxyPort ?? 3334;
  if (voicePort > 0) {
    app.all('/voice/*', async (req: Request, res: Response) => {
      metrics.voiceProxied++;
      try {
        const url = `http://localhost:${voicePort}${req.originalUrl}`;
        const headers: Record<string, string> = {
          'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
        };
        const resp = await fetch(url, {
          method: req.method,
          headers,
          body: req.method !== 'GET' && req.method !== 'HEAD'
            ? new URLSearchParams(req.body as Record<string, string>).toString()
            : undefined,
        });
        const body = await resp.text();
        res.status(resp.status).type(resp.headers.get('content-type') || 'text/xml').send(body);
      } catch (err) {
        metrics.voiceProxyErrors++;
        logger.error('Voice proxy failed', { error: (err as Error).message, path: req.originalUrl });
        res.status(502).type('text/xml').send(twiml('Voice server unavailable'));
      }
    });
  }

  // ─── SMS webhook ─────────────────────────────────────────
  app.post('/sms/webhook', async (req: Request, res: Response) => {
    metrics.smsReceived++;

    // Twilio signature validation
    if (config.twilioAuthToken && config.publicUrl) {
      const signature = req.get('X-Twilio-Signature') || '';
      const url = `${config.publicUrl}${req.originalUrl}`;
      if (!validateTwilioSignature(config.twilioAuthToken, signature, url, req.body)) {
        metrics.signatureFailures++;
        metrics.rejected++;
        logger.warn('Twilio signature validation failed', {
          ip: req.ip || req.socket.remoteAddress,
          from: req.body?.From,
        });
        res.status(403).type('text/xml').send(twiml('Forbidden'));
        return;
      }
    }

    const { From, To, Body } = req.body || {};

    if (!From || typeof From !== 'string') {
      metrics.rejected++;
      logger.warn('Missing or invalid From field', { body: summarizeBody(req.body) });
      res.status(400).type('text/xml').send(twiml('Missing required field: From'));
      return;
    }

    if (!Body && Body !== '') {
      metrics.rejected++;
      logger.warn('Missing Body field', { from: From });
      res.status(400).type('text/xml').send(twiml('Missing required field: Body'));
      return;
    }

    // Empty body is technically valid (MMS with no text)
    const messageBody = typeof Body === 'string' ? Body : String(Body);

    logger.info('SMS received', {
      from: From,
      to: To,
      bodyLength: messageBody.length,
      hasMedia: !!req.body.NumMedia && req.body.NumMedia !== '0',
    });

    // Forward to gateway
    const start = Date.now();
    try {
      await gateway.sendMessage(From, messageBody);
      const latencyMs = Date.now() - start;
      recordLatency(metrics, latencyMs);
      metrics.forwardSuccess++;
      logger.info('Forwarded to gateway', { from: From, latencyMs });
    } catch (err) {
      const latencyMs = Date.now() - start;
      recordLatency(metrics, latencyMs);
      metrics.forwardFailure++;
      logger.error('Failed to forward to gateway', {
        from: From,
        latencyMs,
        error: (err as Error).message,
        detail: (err as any).detail,
      });
    }

    // Always return 200 TwiML to Twilio — never cause retries
    res.type('text/xml').send(twiml());
  });

  // ─── 404 fallback ────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Expose metrics for testing
  (app as any).__metrics = metrics;

  return app;
}

/** Summarize body for logging without leaking full content */
function summarizeBody(body: unknown): string {
  if (!body) return '<empty>';
  if (typeof body === 'object') {
    return Object.keys(body as object).join(',');
  }
  return typeof body;
}
