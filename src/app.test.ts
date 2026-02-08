import crypto from 'crypto';
import request from 'supertest';
import { createApp, AppConfig } from './app';
import { GatewayClient } from './gateway';
import { createNullLogger } from './logger';
import { Metrics } from './metrics';

const logger = createNullLogger();

function mockGateway(opts?: { fail?: boolean; delay?: number }): GatewayClient & { calls: Array<{ from: string; body: string }> } {
  const calls: Array<{ from: string; body: string }> = [];
  return {
    calls,
    async sendMessage(from: string, body: string) {
      if (opts?.delay) await new Promise(r => setTimeout(r, opts.delay));
      if (opts?.fail) throw new Error('gateway down');
      calls.push({ from, body });
    },
  };
}

function makeApp(overrides?: Partial<AppConfig>) {
  const config: AppConfig = {
    gateway: mockGateway(),
    logger,
    voiceProxyPort: 0, // disable voice proxy in tests by default
    ...overrides,
  };
  return createApp(config);
}

function getMetrics(app: any): Metrics {
  return app.__metrics;
}

// Helper: generate valid Twilio signature
function twilioSign(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], '');
  return crypto.createHmac('sha1', authToken).update(data).digest('base64');
}

// ─── Health & Metrics endpoints ──────────────────────────

describe('GET /health', () => {
  it('returns ok with metrics', async () => {
    const app = makeApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.smsReceived).toBe(0);
  });
});

describe('GET /metrics', () => {
  it('returns prometheus format', async () => {
    const app = makeApp();
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('sms_webhook_received_total');
    expect(res.text).toContain('# HELP');
    expect(res.text).toContain('# TYPE');
  });
});

// ─── SMS webhook: happy path ─────────────────────────────

describe('POST /sms/webhook - happy path', () => {
  it('forwards SMS and returns TwiML', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+15125551234', To: '+15124123337', Body: 'Hello there' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<Response>');
    expect(gw.calls).toHaveLength(1);
    expect(gw.calls[0]).toEqual({ from: '+15125551234', body: 'Hello there' });
  });

  it('increments smsReceived and forwardSuccess', async () => {
    const app = makeApp();
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+1', To: '+2', Body: 'x' });
    const m = getMetrics(app);
    expect(m.smsReceived).toBe(1);
    expect(m.forwardSuccess).toBe(1);
    expect(m.forwardFailure).toBe(0);
  });

  it('records forward latency', async () => {
    const app = makeApp();
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+1', Body: 'x' });
    const m = getMetrics(app);
    expect(m.forwardLatencies.length).toBe(1);
    expect(m.forwardLatencies[0]).toBeGreaterThanOrEqual(0);
  });

  it('handles JSON content-type', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const res = await request(app)
      .post('/sms/webhook')
      .type('json')
      .send({ From: '+15125551234', Body: 'JSON body' });

    expect(res.status).toBe(200);
    expect(gw.calls[0].body).toBe('JSON body');
  });

  it('handles empty Body (MMS with no text)', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+1', Body: '' });

    expect(res.status).toBe(200);
    expect(gw.calls[0].body).toBe('');
  });

  it('handles numeric Body by converting to string', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const res = await request(app)
      .post('/sms/webhook')
      .type('json')
      .send({ From: '+1', Body: 12345 });

    expect(res.status).toBe(200);
    expect(gw.calls[0].body).toBe('12345');
  });

  it('handles unicode/emoji in body', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+1', Body: '你好 🎉 café' });

    expect(res.status).toBe(200);
    expect(gw.calls[0].body).toBe('你好 🎉 café');
  });

  it('handles very long body', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const longBody = 'x'.repeat(10000);
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+1', Body: longBody });

    expect(res.status).toBe(200);
    expect(gw.calls[0].body.length).toBe(10000);
  });
});

// ─── SMS webhook: validation errors ─────────────────────

describe('POST /sms/webhook - validation', () => {
  it('returns 400 for missing From', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ Body: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('From');
    expect(getMetrics(app).rejected).toBe(1);
  });

  it('returns 400 for missing Body', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+15125551234' });

    expect(res.status).toBe(400);
    expect(res.text).toContain('Body');
    expect(getMetrics(app).rejected).toBe(1);
  });

  it('returns 400 for completely empty body', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({});

    expect(res.status).toBe(400);
    expect(getMetrics(app).rejected).toBe(1);
  });

  it('returns 400 for empty From string', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '', Body: 'test' });

    expect(res.status).toBe(400);
  });

  it('counts rejected in metrics but not forwardFailure', async () => {
    const app = makeApp();
    await request(app).post('/sms/webhook').type('form').send({});
    const m = getMetrics(app);
    expect(m.rejected).toBe(1);
    expect(m.smsReceived).toBe(1);
    expect(m.forwardFailure).toBe(0);
  });
});

// ─── SMS webhook: gateway failures ──────────────────────

describe('POST /sms/webhook - gateway failures', () => {
  it('returns 200 TwiML even when gateway fails', async () => {
    const app = makeApp({ gateway: mockGateway({ fail: true }) });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+1', Body: 'Test' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response>');
  });

  it('increments forwardFailure on gateway error', async () => {
    const app = makeApp({ gateway: mockGateway({ fail: true }) });
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+1', Body: 'x' });
    const m = getMetrics(app);
    expect(m.forwardFailure).toBe(1);
    expect(m.forwardSuccess).toBe(0);
  });

  it('still records latency on gateway failure', async () => {
    const app = makeApp({ gateway: mockGateway({ fail: true }) });
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+1', Body: 'x' });
    expect(getMetrics(app).forwardLatencies.length).toBe(1);
  });
});

// ─── Twilio signature validation ────────────────────────

describe('POST /sms/webhook - Twilio signature validation', () => {
  const authToken = 'test-twilio-auth-token';
  const publicUrl = 'https://example.ngrok-free.dev';

  function signedRequest(app: any, params: Record<string, string>) {
    const url = `${publicUrl}/sms/webhook`;
    const sig = twilioSign(authToken, url, params);
    return request(app)
      .post('/sms/webhook')
      .type('form')
      .set('X-Twilio-Signature', sig)
      .send(params);
  }

  it('accepts request with valid signature', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw, twilioAuthToken: authToken, publicUrl });
    const params = { From: '+15125551234', To: '+15124123337', Body: 'Signed' };
    const res = await signedRequest(app, params);
    expect(res.status).toBe(200);
    expect(gw.calls).toHaveLength(1);
    expect(getMetrics(app).signatureFailures).toBe(0);
  });

  it('rejects request with invalid signature', async () => {
    const app = makeApp({ twilioAuthToken: authToken, publicUrl });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .set('X-Twilio-Signature', 'invalidsig==')
      .send({ From: '+1', Body: 'x' });

    expect(res.status).toBe(403);
    expect(res.text).toContain('Forbidden');
    expect(getMetrics(app).signatureFailures).toBe(1);
    expect(getMetrics(app).rejected).toBe(1);
  });

  it('rejects request with missing signature header', async () => {
    const app = makeApp({ twilioAuthToken: authToken, publicUrl });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+1', Body: 'x' });

    expect(res.status).toBe(403);
    expect(getMetrics(app).signatureFailures).toBe(1);
  });

  it('skips validation when authToken not configured', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw }); // no twilioAuthToken
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+1', Body: 'no sig needed' });

    expect(res.status).toBe(200);
    expect(gw.calls).toHaveLength(1);
  });

  it('skips validation when publicUrl not configured', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw, twilioAuthToken: authToken }); // no publicUrl
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({ From: '+1', Body: 'no sig needed' });

    expect(res.status).toBe(200);
    expect(gw.calls).toHaveLength(1);
  });

  it('rejects tampered body with valid sig for original', async () => {
    const app = makeApp({ twilioAuthToken: authToken, publicUrl });
    const origParams = { From: '+1', Body: 'original' };
    const url = `${publicUrl}/sms/webhook`;
    const sig = twilioSign(authToken, url, origParams);

    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .set('X-Twilio-Signature', sig)
      .send({ From: '+1', Body: 'tampered' });

    expect(res.status).toBe(403);
  });
});

// ─── 404 handling ────────────────────────────────────────

describe('404 handling', () => {
  it('returns 404 JSON for unknown routes', async () => {
    const app = makeApp();
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('returns 404 for POST to unknown routes', async () => {
    const app = makeApp();
    const res = await request(app).post('/unknown').send({});
    expect(res.status).toBe(404);
  });

  it('returns 404 for GET /sms/webhook (wrong method)', async () => {
    const app = makeApp();
    const res = await request(app).get('/sms/webhook');
    expect(res.status).toBe(404);
  });
});

// ─── Multiple requests / metrics accumulation ───────────

describe('metrics accumulation', () => {
  it('accumulates across multiple requests', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });

    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+1', Body: 'a' });
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+2', Body: 'b' });
    await request(app).post('/sms/webhook').type('form')
      .send({}); // rejected

    const m = getMetrics(app);
    expect(m.smsReceived).toBe(3);
    expect(m.forwardSuccess).toBe(2);
    expect(m.rejected).toBe(1);
    expect(gw.calls).toHaveLength(2);
  });

  it('health endpoint reflects accumulated metrics', async () => {
    const app = makeApp();
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+1', Body: 'x' });
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+2', Body: 'y' });

    const res = await request(app).get('/health');
    expect(res.body.metrics.smsReceived).toBe(2);
    expect(res.body.metrics.forwardSuccess).toBe(2);
  });

  it('prometheus endpoint reflects accumulated metrics', async () => {
    const app = makeApp({ gateway: mockGateway({ fail: true }) });
    await request(app).post('/sms/webhook').type('form')
      .send({ From: '+1', Body: 'x' });

    const res = await request(app).get('/metrics');
    expect(res.text).toContain('sms_webhook_received_total 1');
    expect(res.text).toContain('sms_webhook_forward_failure_total 1');
  });
});

// ─── Typical Twilio payloads ────────────────────────────

describe('realistic Twilio payloads', () => {
  it('handles full Twilio SMS payload', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({
        ToCountry: 'US',
        ToState: 'TX',
        SmsMessageSid: 'SM1234567890',
        NumMedia: '0',
        ToCity: 'AUSTIN',
        FromZip: '78701',
        SmsSid: 'SM1234567890',
        FromState: 'TX',
        SmsStatus: 'received',
        FromCity: 'AUSTIN',
        Body: 'Hey there!',
        FromCountry: 'US',
        To: '+15124123337',
        ToZip: '78702',
        NumSegments: '1',
        MessageSid: 'SM1234567890',
        AccountSid: 'AC1234567890',
        From: '+15125551234',
        ApiVersion: '2010-04-01',
      });

    expect(res.status).toBe(200);
    expect(gw.calls[0]).toEqual({ from: '+15125551234', body: 'Hey there!' });
  });

  it('handles MMS payload with media', async () => {
    const gw = mockGateway();
    const app = makeApp({ gateway: gw });
    const res = await request(app)
      .post('/sms/webhook')
      .type('form')
      .send({
        From: '+15125551234',
        To: '+15124123337',
        Body: '',
        NumMedia: '1',
        MediaContentType0: 'image/jpeg',
        MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123',
      });

    expect(res.status).toBe(200);
    expect(gw.calls[0].body).toBe('');
  });
});
