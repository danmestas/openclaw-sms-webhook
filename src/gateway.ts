export interface GatewayConfig {
  url: string;
  token: string;
  sessionId?: string;
}

export class OpenClawGateway {
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  async sendMessage(from: string, body: string): Promise<void> {
    const sessionId = this.config.sessionId || 'agent:main:main';
    const url = `${this.config.url}/api/sessions/${encodeURIComponent(sessionId)}/message`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({
        text: `[SMS from ${from}]: ${body}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}: ${await response.text()}`);
    }
  }
}
