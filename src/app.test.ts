import request from 'supertest';
import { createApp, GatewayClient } from './app';

function mockGateway(): GatewayClient & { calls: Array<{ from: string; body: string }> } {
  const calls: Array<{ from: string; body: string }> = [];
  return {
    calls,
    async sendMessage(from: string, body: string) {
      calls.push({ from, body });
    },
  };
}

describe('SMS Webhook', () => {
  it('GET /health returns ok', async () => {
    const app = createApp(mockGateway());
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /sms/webhook forwards SMS to gateway', async () => {
    const gw = mockGateway();
    const app = createApp(gw);
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+15125551234', To: '+15124123337', Body: 'Hello there' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<Response>');
    expect(gw.calls).toHaveLength(1);
    expect(gw.calls[0].from).toBe('+15125551234');
    expect(gw.calls[0].body).toBe('Hello there');
  });

  it('returns 400 for missing From', async () => {
    const app = createApp(mockGateway());
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ Body: 'Hello' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing Body', async () => {
    const app = createApp(mockGateway());
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+15125551234' });

    expect(res.status).toBe(400);
  });

  it('still returns 200 TwiML even if gateway fails', async () => {
    const gw: GatewayClient = {
      async sendMessage() {
        throw new Error('gateway down');
      },
    };
    const app = createApp(gw);
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+15125551234', To: '+15124123337', Body: 'Test' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response>');
  });
});
