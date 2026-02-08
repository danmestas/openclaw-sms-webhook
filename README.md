# openclaw-sms-webhook

Twilio SMS webhook handler that forwards inbound SMS to an OpenClaw gateway session.

## Setup

```bash
npm install
npm run build
```

## Configuration

Set environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3335` | Server port |
| `GATEWAY_URL` | `http://localhost:18789` | OpenClaw gateway URL |
| `GATEWAY_TOKEN` | (required) | Gateway auth token |
| `SESSION_ID` | `agent:main:main` | Target session ID |

## Run

```bash
GATEWAY_TOKEN=your-token npm start
```

## Development

```bash
npm test        # run tests
npm run dev     # run with ts-node
```

## Docker

```bash
docker build -t openclaw-sms-webhook .
docker run -p 3335:3335 -e GATEWAY_TOKEN=your-token openclaw-sms-webhook
```

## Twilio Configuration

Set your Twilio phone number's SMS webhook URL to:
```
https://your-domain.com/sms/webhook
```
Method: POST
