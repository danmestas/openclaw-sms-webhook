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
