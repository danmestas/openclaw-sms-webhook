import { createApp } from './app';
import { OpenClawGateway } from './gateway';
import { createLogger, LogLevel } from './logger';

const PORT = parseInt(process.env.PORT || '3335', 10);
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const SESSION_ID = process.env.SESSION_ID || 'agent:main:main';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const VOICE_PROXY_PORT = parseInt(process.env.VOICE_PROXY_PORT || '3334', 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;
const STATS_INTERVAL = parseInt(process.env.STATS_INTERVAL_MS || '60000', 10);

const logger = createLogger(LOG_LEVEL);

if (!GATEWAY_TOKEN) {
  logger.error('GATEWAY_TOKEN environment variable is required');
  process.exit(1);
}

const gateway = new OpenClawGateway(
  { url: GATEWAY_URL, token: GATEWAY_TOKEN, sessionId: SESSION_ID },
  logger,
);

const app = createApp({
  gateway,
  logger,
  twilioAuthToken: TWILIO_AUTH_TOKEN || undefined,
  publicUrl: PUBLIC_URL || undefined,
  voiceProxyPort: VOICE_PROXY_PORT,
});

const server = app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    gateway: GATEWAY_URL,
    session: SESSION_ID,
    twilioValidation: !!TWILIO_AUTH_TOKEN,
    voiceProxy: VOICE_PROXY_PORT > 0 ? VOICE_PROXY_PORT : 'disabled',
  });
});

// Periodic stats logging
if (STATS_INTERVAL > 0) {
  setInterval(() => {
    const m = (app as any).__metrics;
    if (m) {
      logger.info('stats', {
        smsReceived: m.smsReceived,
        forwardSuccess: m.forwardSuccess,
        forwardFailure: m.forwardFailure,
        rejected: m.rejected,
        signatureFailures: m.signatureFailures,
      });
    }
  }, STATS_INTERVAL);
}

// Graceful shutdown
function shutdown(signal: string) {
  logger.info('Shutting down', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
