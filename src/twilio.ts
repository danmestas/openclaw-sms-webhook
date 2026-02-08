import crypto from 'crypto';

/**
 * Validate a Twilio request signature.
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 *
 * @param authToken  - Twilio auth token
 * @param signature  - Value of the X-Twilio-Signature header
 * @param url        - The full URL Twilio sent the request to
 * @param params     - The POST body parameters (key-value)
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!authToken || !signature || !url) return false;

  // Sort params alphabetically by key, concatenate key+value
  const data =
    url +
    Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], '');

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Lengths differ
    return false;
  }
}

/**
 * Build a TwiML response.
 */
export function twiml(message?: string): string {
  if (message) {
    // Escape XML special chars
    const escaped = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}
