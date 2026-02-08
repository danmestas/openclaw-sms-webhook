import { Logger } from './logger';

export interface GatewayConfig {
  url: string;
  token: string;
  sessionId?: string;
  timeoutMs?: number;
}

export interface GatewayClient {
  sendMessage(from: string, body: string): Promise<void>;
}

export class OpenClawGateway implements GatewayClient {
  private config: GatewayConfig;
  private logger: Logger;

  constructor(config: GatewayConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    if (!config.url) throw new Error('Gateway URL is required');
    if (!config.token) throw new Error('Gateway token is required');
  }

  async sendMessage(from: string, body: string): Promise<void> {
    const sessionId = this.config.sessionId || 'agent:main:main';
    const url = `${this.config.url}/api/sessions/${encodeURIComponent(sessionId)}/message`;
    const timeoutMs = this.config.timeoutMs || 10000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          text: `[SMS from ${from}]: ${body}`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new GatewayError(
          `Gateway returned ${response.status}`,
          response.status,
          text,
        );
      }

      this.logger.debug('Message forwarded to gateway', { from, sessionId });
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new GatewayError('Gateway request timed out', 0, `timeout after ${timeoutMs}ms`);
      }
      throw new GatewayError(
        'Gateway request failed',
        0,
        (err as Error).message,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export class GatewayError extends Error {
  public readonly statusCode: number;
  public readonly detail: string;

  constructor(message: string, statusCode: number, detail: string) {
    super(message);
    this.name = 'GatewayError';
    this.statusCode = statusCode;
    this.detail = detail;
  }
}
