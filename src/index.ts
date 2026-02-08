import { createApp } from './app';
import { OpenClawGateway } from './gateway';

const PORT = parseInt(process.env.PORT || '3335', 10);
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const SESSION_ID = process.env.SESSION_ID || 'agent:main:main';

if (!GATEWAY_TOKEN) {
  console.error('GATEWAY_TOKEN environment variable is required');
  process.exit(1);
}

const gateway = new OpenClawGateway({
  url: GATEWAY_URL,
  token: GATEWAY_TOKEN,
  sessionId: SESSION_ID,
});

const app = createApp(gateway);

app.listen(PORT, () => {
  console.log(`[SMS Webhook] Listening on port ${PORT}`);
  console.log(`[SMS Webhook] Gateway: ${GATEWAY_URL}`);
  console.log(`[SMS Webhook] Session: ${SESSION_ID}`);
});
