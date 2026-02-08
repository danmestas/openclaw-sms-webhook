import http from 'http';
import request from 'supertest';
import { createApp, AppConfig } from './app';
import { GatewayClient } from './gateway';
import { createNullLogger } from './logger';

const logger = createNullLogger();

function mockGateway(): GatewayClient {
  return { async sendMessage() {} };
}

describe('Voice proxy', () => {
  let voiceServer: http.Server;
  let voicePort: number;

  beforeAll((done) => {
    voiceServer = http.createServer((req, res) => {
      if (req.url === '/voice/webhook') {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<?xml version="1.0"?><Response><Say>Hello</Say></Response>');
      } else if (req.url === '/voice/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"ok"}');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    voiceServer.listen(0, () => {
      voicePort = (voiceServer.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    voiceServer.close(done);
  });

  it('proxies POST /voice/webhook to voice server', async () => {
    const app = createApp({ gateway: mockGateway(), logger, voiceProxyPort: voicePort });
    const res = await request(app)
      .post('/voice/webhook')
      .type('form')
      .send({ CallSid: 'CA123' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Say>Hello</Say>');
  });

  it('proxies GET /voice/status to voice server', async () => {
    const app = createApp({ gateway: mockGateway(), logger, voiceProxyPort: voicePort });
    const res = await request(app).get('/voice/status');
    expect(res.status).toBe(200);
  });

  it('returns 502 when voice server is down', async () => {
    const app = createApp({ gateway: mockGateway(), logger, voiceProxyPort: 19999 }); // nothing on this port
    const res = await request(app)
      .post('/voice/webhook')
      .type('form')
      .send({});
    expect(res.status).toBe(502);
    expect(res.text).toContain('Voice server unavailable');
  });

  it('increments voiceProxied metric', async () => {
    const app = createApp({ gateway: mockGateway(), logger, voiceProxyPort: voicePort });
    await request(app).post('/voice/webhook').type('form').send({});
    expect((app as any).__metrics.voiceProxied).toBe(1);
  });

  it('increments voiceProxyErrors on failure', async () => {
    const app = createApp({ gateway: mockGateway(), logger, voiceProxyPort: 19999 });
    await request(app).post('/voice/webhook').type('form').send({});
    expect((app as any).__metrics.voiceProxyErrors).toBe(1);
  });
});
