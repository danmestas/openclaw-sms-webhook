import crypto from 'crypto';
import { validateTwilioSignature, twiml } from './twilio';

describe('validateTwilioSignature', () => {
  const authToken = 'test-auth-token-12345';

  function sign(url: string, params: Record<string, string>): string {
    const data =
      url +
      Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], '');
    return crypto.createHmac('sha1', authToken).update(data).digest('base64');
  }

  it('validates a correct signature', () => {
    const url = 'https://example.com/sms/webhook';
    const params = { From: '+15125551234', Body: 'Hello', To: '+15124123337' };
    const sig = sign(url, params);
    expect(validateTwilioSignature(authToken, sig, url, params)).toBe(true);
  });

  it('rejects an incorrect signature', () => {
    const url = 'https://example.com/sms/webhook';
    const params = { From: '+15125551234', Body: 'Hello' };
    expect(validateTwilioSignature(authToken, 'badsig==', url, params)).toBe(false);
  });

  it('rejects when authToken is empty', () => {
    expect(validateTwilioSignature('', 'sig', 'https://x.com', {})).toBe(false);
  });

  it('rejects when signature is empty', () => {
    expect(validateTwilioSignature(authToken, '', 'https://x.com', {})).toBe(false);
  });

  it('rejects when url is empty', () => {
    expect(validateTwilioSignature(authToken, 'sig', '', {})).toBe(false);
  });

  it('handles empty params', () => {
    const url = 'https://example.com/sms/webhook';
    const sig = sign(url, {});
    expect(validateTwilioSignature(authToken, sig, url, {})).toBe(true);
  });

  it('handles params with special characters', () => {
    const url = 'https://example.com/sms/webhook';
    const params = { Body: 'Hello & goodbye <world>', From: '+1 (512) 555-1234' };
    const sig = sign(url, params);
    expect(validateTwilioSignature(authToken, sig, url, params)).toBe(true);
  });

  it('is sensitive to param order (sorts internally)', () => {
    const url = 'https://example.com/sms/webhook';
    const params = { Z: '1', A: '2', M: '3' };
    const sig = sign(url, params);
    expect(validateTwilioSignature(authToken, sig, url, params)).toBe(true);
  });

  it('rejects if body tampered', () => {
    const url = 'https://example.com/sms/webhook';
    const params = { From: '+15125551234', Body: 'Hello' };
    const sig = sign(url, params);
    params.Body = 'Tampered';
    expect(validateTwilioSignature(authToken, sig, url, params)).toBe(false);
  });
});

describe('twiml', () => {
  it('returns empty response when no message', () => {
    expect(twiml()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  it('includes message when provided', () => {
    const result = twiml('Hello');
    expect(result).toContain('<Message>Hello</Message>');
    expect(result).toContain('<?xml');
  });

  it('escapes XML special characters', () => {
    const result = twiml('a < b & c > d "e"');
    expect(result).toContain('&lt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&quot;');
    expect(result).not.toContain('< b');
  });

  it('handles empty string message', () => {
    const result = twiml('');
    // Empty string = no message
    expect(result).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
});
