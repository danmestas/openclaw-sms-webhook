import { createMetrics, recordLatency, getLatencyStats, formatPrometheus, Metrics } from './metrics';

describe('Metrics', () => {
  let metrics: Metrics;

  beforeEach(() => {
    metrics = createMetrics();
  });

  it('initializes all counters to zero', () => {
    expect(metrics.smsReceived).toBe(0);
    expect(metrics.forwardSuccess).toBe(0);
    expect(metrics.forwardFailure).toBe(0);
    expect(metrics.rejected).toBe(0);
    expect(metrics.signatureFailures).toBe(0);
    expect(metrics.forwardLatencies).toEqual([]);
  });

  it('sets startedAt to approximately now', () => {
    expect(Math.abs(metrics.startedAt - Date.now())).toBeLessThan(100);
  });
});

describe('recordLatency', () => {
  it('records latency samples', () => {
    const m = createMetrics();
    recordLatency(m, 100);
    recordLatency(m, 200);
    expect(m.forwardLatencies).toEqual([100, 200]);
  });

  it('caps at 1000 samples', () => {
    const m = createMetrics();
    for (let i = 0; i < 1100; i++) {
      recordLatency(m, i);
    }
    expect(m.forwardLatencies.length).toBe(1000);
    expect(m.forwardLatencies[0]).toBe(100); // oldest trimmed
  });
});

describe('getLatencyStats', () => {
  it('returns zeros for empty data', () => {
    const stats = getLatencyStats(createMetrics());
    expect(stats.count).toBe(0);
    expect(stats.avg).toBe(0);
    expect(stats.p50).toBe(0);
  });

  it('calculates correct stats', () => {
    const m = createMetrics();
    // 1..100
    for (let i = 1; i <= 100; i++) recordLatency(m, i);
    const stats = getLatencyStats(m);
    expect(stats.count).toBe(100);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(100);
    expect(stats.p50).toBe(51);
    expect(stats.p95).toBe(96);
    expect(stats.avg).toBe(51); // 5050/100 rounded
  });

  it('handles single sample', () => {
    const m = createMetrics();
    recordLatency(m, 42);
    const stats = getLatencyStats(m);
    expect(stats.count).toBe(1);
    expect(stats.avg).toBe(42);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
  });
});

describe('formatPrometheus', () => {
  it('produces valid prometheus output', () => {
    const m = createMetrics();
    m.smsReceived = 10;
    m.forwardSuccess = 8;
    m.forwardFailure = 2;
    m.rejected = 1;
    recordLatency(m, 50);

    const output = formatPrometheus(m);
    expect(output).toContain('sms_webhook_received_total 10');
    expect(output).toContain('sms_webhook_forward_success_total 8');
    expect(output).toContain('sms_webhook_forward_failure_total 2');
    expect(output).toContain('sms_webhook_rejected_total 1');
    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
    expect(output).toContain('sms_webhook_uptime_seconds');
  });
});
