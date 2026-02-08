import { OpenClawGateway, GatewayError } from './gateway';
import { createNullLogger } from './logger';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const logger = createNullLogger();

describe('OpenClawGateway', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('throws if url is empty', () => {
    expect(() => new OpenClawGateway({ url: '', token: 'tok' }, logger)).toThrow('URL is required');
  });

  it('throws if token is empty', () => {
    expect(() => new OpenClawGateway({ url: 'http://x', token: '' }, logger)).toThrow('token is required');
  });

  it('sends message to correct endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const gw = new OpenClawGateway(
      { url: 'http://localhost:18789', token: 'tok123', sessionId: 'agent:main:main' },
      logger,
    );
    await gw.sendMessage('+15125551234', 'Hello');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:18789/api/sessions/agent%3Amain%3Amain/message');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer tok123');
    const body = JSON.parse(opts.body);
    expect(body.text).toBe('[SMS from +15125551234]: Hello');
  });

  it('uses default session ID', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const gw = new OpenClawGateway({ url: 'http://localhost:18789', token: 'tok' }, logger);
    await gw.sendMessage('+1', 'x');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('agent%3Amain%3Amain');
  });

  it('throws GatewayError on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const gw = new OpenClawGateway({ url: 'http://x', token: 'tok' }, logger);
    await expect(gw.sendMessage('+1', 'x')).rejects.toThrow(GatewayError);
    await expect(gw.sendMessage('+1', 'x')).rejects.toMatchObject({
      statusCode: 401,
      detail: 'Unauthorized',
    });
  });

  it('throws GatewayError on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const gw = new OpenClawGateway({ url: 'http://x', token: 'tok' }, logger);
    await expect(gw.sendMessage('+1', 'x')).rejects.toThrow(GatewayError);
    await expect(gw.sendMessage('+1', 'x')).rejects.toMatchObject({
      detail: 'ECONNREFUSED',
    });
  });

  it('throws GatewayError on timeout (abort)', async () => {
    mockFetch.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, 10);
    }));
    const gw = new OpenClawGateway(
      { url: 'http://x', token: 'tok', timeoutMs: 5 },
      logger,
    );
    await expect(gw.sendMessage('+1', 'x')).rejects.toThrow(GatewayError);
  });
});
