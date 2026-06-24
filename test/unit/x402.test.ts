import { describe, it, expect } from 'vitest';
import type { PaymentPayload, PaymentRequired } from '../../src/types/x402.js';

describe('x402 types', () => {
  it('should produce a valid PaymentRequired structure', () => {
    const pr: PaymentRequired = {
      x402Version: 2,
      error: 'Payment required',
      resource: { url: '/api/test', mimeType: 'application/json' },
      accepts: [
        { scheme: 'nvm:card-delegation', network: 'stripe', extra: { version: '1' } },
      ],
      extensions: {},
    };
    expect(pr.x402Version).toBe(2);
    expect(pr.accepts.length).toBe(1);
    expect(pr.resource.url).toBe('/api/test');
  });

  it('should produce a valid PaymentPayload structure', () => {
    const pp: PaymentPayload = {
      x402Version: 2,
      resource: { url: '/api/test' },
      accepted: {
        scheme: 'nvm:card-delegation',
        network: 'stripe',
        extra: { version: '1' },
      },
      payload: {
        token: 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.mock',
        authorization: {
          from: '0x1234567890abcdef',
          sessionKeys: [{ id: 'redeem', data: '0xdeadbeef' }],
        },
      },
      extensions: {},
    };
    expect(pp.x402Version).toBe(2);
    expect(pp.payload.token).toBeTruthy();
    expect(pp.payload.authorization?.from).toBe('0x1234567890abcdef');
    expect(pp.payload.authorization?.sessionKeys[0].id).toBe('redeem');
  });

  it('should base64-encode and decode a PaymentPayload', () => {
    const pp: PaymentPayload = {
      x402Version: 2,
      resource: { url: '/api/test' },
      accepted: { scheme: 'nvm:card-delegation', network: 'stripe', extra: { version: '1' } },
      payload: { token: 'test-token' },
      extensions: {},
    };
    const encoded = Buffer.from(JSON.stringify(pp)).toString('base64');
    const decoded: PaymentPayload = JSON.parse(Buffer.from(encoded, 'base64').toString());
    expect(decoded.x402Version).toBe(2);
    expect(decoded.payload.token).toBe('test-token');
    expect(decoded.extensions).toEqual({});
  });

  it('should handle optional fields correctly', () => {
    const pp: PaymentPayload = {
      x402Version: 2,
      accepted: { scheme: 'nvm:card-delegation', network: 'stripe', extra: { version: '1' } },
      payload: { token: 'minimal' },
      extensions: {},
    };
    expect(pp.resource).toBeUndefined();
    expect(pp.payload.authorization).toBeUndefined();
  });
});
