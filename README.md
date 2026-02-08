# openclaw-sms-webhook

Production-grade Twilio SMS webhook handler that forwards inbound SMS to an OpenClaw gateway session.

## Features

- **Twilio SMS webhook** — receives inbound SMS at `POST /sms/webhook`
- **Twilio signature validation** — optional HMAC-SHA1 verification of `X-Twilio-Signature`
- **Voice proxy** — forwards `/voice/*` requests to a co-located voice webhook server
- **Structured JSON logging** — all logs are machine-parseable JSON to stderr/stdout
- **Prometheus metrics** — `GET /metrics` endpoint with counters, latency percentiles
- **Health check** — `GET /health` with uptime, message counts, latency stats
- **Graceful shutdown** — handles SIGTERM/SIGINT
- **98%+ test coverage** — 70 tests across 6 test suites

## Setup

```bash
npm install
npm run build
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3335` | Server port |
| `GATEWAY_URL` | `http://localhost:18789` | OpenClaw gateway URL |
| `GATEWAY_TOKEN` | (required) | Gateway auth token |
| `SESSION_ID` | `agent:main:main` | Target session ID |
| `TWILIO_AUTH_TOKEN` | (optional) | Twilio auth token for signature validation |
| `PUBLIC_URL` | (optional) | Public URL base for signature validation |
| `VOICE_PROXY_PORT` | `3334` | Port to proxy `/voice/*` to (0 to disable) |
| `LOG_LEVEL` | `info` | Minimum log level: debug, info, warn, error |
| `STATS_INTERVAL_MS` | `60000` | Periodic stats logging interval (0 to disable) |

## Run

```bash
GATEWAY_TOKEN=your-token npm start
```

With Twilio signature validation:
```bash
GATEWAY_TOKEN=your-token \
TWILIO_AUTH_TOKEN=your-twilio-token \
PUBLIC_URL=https://your-domain.ngrok-free.dev \
npm start
```

## Testing

```bash
npm test              # run tests
npm run test:coverage # run with coverage report
```

## Docker

```bash
docker build -t openclaw-sms-webhook .
docker run -p 3335:3335 \
  -e GATEWAY_TOKEN=your-token \
  -e TWILIO_AUTH_TOKEN=your-twilio-token \
  -e PUBLIC_URL=https://your-domain.com \
  openclaw-sms-webhook
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check with metrics summary |
| `GET` | `/metrics` | Prometheus-format metrics |
| `POST` | `/sms/webhook` | Twilio SMS webhook |
| `ALL` | `/voice/*` | Proxy to voice webhook server |

## Twilio Configuration

Set your Twilio phone number's SMS webhook URL to:
```
https://your-domain.com/sms/webhook
```
Method: POST
