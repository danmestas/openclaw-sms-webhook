import express from 'express';

export interface GatewayClient {
  sendMessage(from: string, body: string): Promise<void>;
}

export function createApp(gateway: GatewayClient) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Proxy voice routes to the voice-call webhook server on port 3334
  app.all('/voice/*', async (req, res) => {
    try {
      const url = `http://localhost:3334${req.originalUrl}`;
      const headers: Record<string, string> = { 'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded' };
      const resp = await fetch(url, {
        method: req.method,
        headers,
        body: req.method !== 'GET' ? new URLSearchParams(req.body as Record<string, string>).toString() : undefined,
      });
      const body = await resp.text();
      res.status(resp.status).type(resp.headers.get('content-type') || 'text/xml').send(body);
    } catch (err) {
      console.error('[Proxy] Failed to proxy to voice server:', err);
      res.status(502).send('Voice server unavailable');
    }
  });

  app.post('/sms/webhook', async (req, res) => {
    const { From, To, Body } = req.body;

    if (!From || !Body) {
      res.status(400).type('text/xml').send(twiml('Missing required fields'));
      return;
    }

    console.log(`[SMS] From: ${From} To: ${To} Body: ${Body}`);

    try {
      await gateway.sendMessage(From, Body);
    } catch (err) {
      console.error('[SMS] Failed to forward to gateway:', err);
    }

    // Always return 200 TwiML to Twilio so it doesn't retry
    res.type('text/xml').send(twiml());
  });

  return app;
}

function twiml(message?: string): string {
  if (message) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}
