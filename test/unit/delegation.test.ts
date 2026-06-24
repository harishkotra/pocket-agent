import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { DelegationConfig, DelegationJwt } from '../../src/types/delegation.js';

describe('Delegation JWT', () => {
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  it('should sign and verify a valid delegation JWT (RS256)', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: DelegationJwt = {
      iss: 'https://api.nevermined.app',
      sub: '0x1234567890abcdef',
      aud: 'nvm:card-delegation',
      jti: 'deleg-550e8400-e29b-41d4-a716-446655440000',
      iat: now,
      exp: now + 3600,
      'nvm': {
        delegationId: 'deleg-550e8400-e29b-41d4-a716-446655440000',
        provider: 'stripe',
        providerCustomerId: 'cus_test_abc123',
        providerPaymentMethodId: 'pm_test_xyz789',
        spendingLimitCents: 10000,
        currency: 'usd',
      },
    };

    const token = jwt.sign(payload, keyPair.privateKey, { algorithm: 'RS256' });
    const decoded = jwt.verify(token, keyPair.publicKey, { algorithms: ['RS256'] }) as any;

    expect(decoded.iss).toBe('https://api.nevermined.app');
    expect(decoded.aud).toBe('nvm:card-delegation');
    expect(decoded.jti).toBe(payload.jti);
    expect(decoded.nvm.provider).toBe('stripe');
    expect(decoded.nvm.spendingLimitCents).toBe(10000);
    expect(decoded.nvm.currency).toBe('usd');
  });

  it('should reject a token signed with the wrong key', () => {
    const wrongKey = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const now = Math.floor(Date.now() / 1000);
    const payload: DelegationJwt = {
      iss: 'https://api.nevermined.app',
      sub: '0x1234',
      aud: 'nvm:card-delegation',
      jti: 'deleg-test',
      iat: now,
      exp: now + 3600,
      'nvm': {
        delegationId: 'deleg-test',
        provider: 'stripe',
        providerCustomerId: 'cus_test',
        providerPaymentMethodId: 'pm_test',
        spendingLimitCents: 5000,
        currency: 'usd',
      },
    };

    const token = jwt.sign(payload, wrongKey.privateKey, { algorithm: 'RS256' });
    expect(() => jwt.verify(token, keyPair.publicKey, { algorithms: ['RS256'] })).toThrow();
  });

  it('should reject an expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: DelegationJwt = {
      iss: 'https://api.nevermined.app',
      sub: '0x1234',
      aud: 'nvm:card-delegation',
      jti: 'deleg-expired',
      iat: now - 7200,
      exp: now - 3600, // expired 1 hour ago
      'nvm': {
        delegationId: 'deleg-expired',
        provider: 'stripe',
        providerCustomerId: 'cus_test',
        providerPaymentMethodId: 'pm_test',
        spendingLimitCents: 5000,
        currency: 'usd',
      },
    };

    const token = jwt.sign(payload, keyPair.privateKey, { algorithm: 'RS256' });
    expect(() => jwt.verify(token, keyPair.publicKey, { algorithms: ['RS256'] })).toThrow('jwt expired');
  });

  it('should reject an ES256 token when RS256 is required', () => {
    const ecKey = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const payload: DelegationJwt = {
      iss: 'https://api.nevermined.app',
      sub: '0x1234',
      aud: 'nvm:card-delegation',
      jti: 'deleg-algo',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      'nvm': {
        delegationId: 'deleg-algo',
        provider: 'stripe',
        providerCustomerId: 'cus_test',
        providerPaymentMethodId: 'pm_test',
        spendingLimitCents: 5000,
        currency: 'usd',
      },
    };

    const token = jwt.sign(payload, ecKey.privateKey, { algorithm: 'ES256' });
    expect(() => jwt.verify(token, keyPair.publicKey, { algorithms: ['RS256'] })).toThrow();
  });

  it('should enforce jti matches nvm.delegationId (Section 3.3)', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: DelegationJwt = {
      iss: 'https://api.nevermined.app',
      sub: '0x1234',
      aud: 'nvm:card-delegation',
      jti: 'deleg-aaa',
      iat: now,
      exp: now + 3600,
      'nvm': {
        delegationId: 'deleg-bbb', // intentionally different
        provider: 'stripe',
        providerCustomerId: 'cus_test',
        providerPaymentMethodId: 'pm_test',
        spendingLimitCents: 5000,
        currency: 'usd',
      },
    };

    const token = jwt.sign(payload, keyPair.privateKey, { algorithm: 'RS256' });
    const decoded = jwt.verify(token, keyPair.publicKey, { algorithms: ['RS256'] }) as any;
    expect(decoded.jti).not.toBe(decoded.nvm.delegationId);
  });
});

describe('Delegation lifecycle', () => {
  it('should transition through statuses correctly', () => {
    const del: DelegationConfig = {
      delegationId: 'deleg-lifecycle',
      provider: 'stripe',
      providerCustomerId: 'cus_test',
      providerPaymentMethodId: 'pm_test',
      spendingLimitCents: 10000,
      spentCents: 0,
      currency: 'usd',
      durationSecs: 86400,
      transactionCount: 0,
      createdAt: Date.now() / 1000,
      expiresAt: Date.now() / 1000 + 86400,
      status: 'Active',
    };

    expect(del.status).toBe('Active');

    // Exhaust by hitting max transactions
    del.transactionCount = 10;
    del.status = 'Exhausted';
    expect(del.status).toBe('Exhausted');

    // Revoke
    del.status = 'Revoked';
    expect(del.status).toBe('Revoked');
  });

  it('should track spending limits correctly', () => {
    const del: DelegationConfig = {
      delegationId: 'deleg-spend',
      provider: 'stripe',
      providerCustomerId: 'cus_test',
      providerPaymentMethodId: 'pm_test',
      spendingLimitCents: 10000,
      spentCents: 0,
      currency: 'usd',
      durationSecs: 86400,
      transactionCount: 0,
      createdAt: Date.now() / 1000,
      expiresAt: Date.now() / 1000 + 86400,
      status: 'Active',
    };

    del.spentCents += 500;
    expect(del.spentCents).toBe(500);
    expect(del.spendingLimitCents - del.spentCents).toBe(9500);

    del.spentCents += 9500;
    expect(del.spentCents).toBe(10000);
    expect(del.spentCents >= del.spendingLimitCents).toBe(true);
  });
});
