export interface Metrics {
  /** Total SMS received */
  smsReceived: number;
  /** Successfully forwarded to gateway */
  forwardSuccess: number;
  /** Failed to forward to gateway */
  forwardFailure: number;
  /** Requests rejected (validation, signature, etc.) */
  rejected: number;
  /** Twilio signature validation failures */
  signatureFailures: number;
  /** Voice proxy requests */
  voiceProxied: number;
  /** Voice proxy errors */
  voiceProxyErrors: number;
  /** Forward latency samples (ms) */
  forwardLatencies: number[];
  /** Server start time */
  startedAt: number;
}

export function createMetrics(): Metrics {
  return {
    smsReceived: 0,
    forwardSuccess: 0,
    forwardFailure: 0,
    rejected: 0,
    signatureFailures: 0,
    voiceProxied: 0,
    voiceProxyErrors: 0,
    forwardLatencies: [],
    startedAt: Date.now(),
  };
}

export function recordLatency(metrics: Metrics, ms: number) {
  metrics.forwardLatencies.push(ms);
  // Keep only last 1000 samples
  if (metrics.forwardLatencies.length > 1000) {
    metrics.forwardLatencies = metrics.forwardLatencies.slice(-1000);
  }
}

export function getLatencyStats(metrics: Metrics) {
  const lat = metrics.forwardLatencies;
  if (lat.length === 0) return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...lat].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export function formatPrometheus(metrics: Metrics): string {
  const latency = getLatencyStats(metrics);
  const uptime = Math.floor((Date.now() - metrics.startedAt) / 1000);
  return [
    '# HELP sms_webhook_uptime_seconds Server uptime in seconds',
    '# TYPE sms_webhook_uptime_seconds gauge',
    `sms_webhook_uptime_seconds ${uptime}`,
    '',
    '# HELP sms_webhook_received_total Total SMS received',
    '# TYPE sms_webhook_received_total counter',
    `sms_webhook_received_total ${metrics.smsReceived}`,
    '',
    '# HELP sms_webhook_forward_success_total Successful gateway forwards',
    '# TYPE sms_webhook_forward_success_total counter',
    `sms_webhook_forward_success_total ${metrics.forwardSuccess}`,
    '',
    '# HELP sms_webhook_forward_failure_total Failed gateway forwards',
    '# TYPE sms_webhook_forward_failure_total counter',
    `sms_webhook_forward_failure_total ${metrics.forwardFailure}`,
    '',
    '# HELP sms_webhook_rejected_total Rejected requests',
    '# TYPE sms_webhook_rejected_total counter',
    `sms_webhook_rejected_total ${metrics.rejected}`,
    '',
    '# HELP sms_webhook_signature_failures_total Twilio signature validation failures',
    '# TYPE sms_webhook_signature_failures_total counter',
    `sms_webhook_signature_failures_total ${metrics.signatureFailures}`,
    '',
    '# HELP sms_webhook_voice_proxied_total Voice proxy requests',
    '# TYPE sms_webhook_voice_proxied_total counter',
    `sms_webhook_voice_proxied_total ${metrics.voiceProxied}`,
    '',
    '# HELP sms_webhook_forward_latency_ms Forward latency statistics',
    '# TYPE sms_webhook_forward_latency_ms summary',
    `sms_webhook_forward_latency_ms{quantile="0.5"} ${latency.p50}`,
    `sms_webhook_forward_latency_ms{quantile="0.95"} ${latency.p95}`,
    `sms_webhook_forward_latency_ms{quantile="0.99"} ${latency.p99}`,
    `sms_webhook_forward_latency_ms_sum ${latency.avg * latency.count}`,
    `sms_webhook_forward_latency_ms_count ${latency.count}`,
    '',
  ].join('\n');
}
