import 'dotenv/config';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Stripe from 'stripe';
import type {
  DelegationConfig,
  CreateDelegationRequest,
  DelegationJwt,
} from '../types/delegation.js';
import type {
  PaymentPayload,
  SettlementReceipt,
} from '../types/x402.js';
import { generateSessionKey } from '../wallet/session-key.js';
import { initOnChain, getCreditBalance, mintCredits, burnCredits } from '../chain/operations.js';

const PORT = parseInt(process.env.FACILITATOR_PORT || '3020');
const FACILITATOR_URL = process.env.FACILITATOR_URL || `http://localhost:${PORT}`;

// ── Real Stripe ───────────────────────────────────────────────
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey || stripeKey === 'sk_test_...') {
  console.error('  [facilitator] FATAL: STRIPE_SECRET_KEY must be a real Stripe test key');
  process.exit(1);
}
const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });

// ── RS256 signing key (Section 5.1) ───────────────────────────
const signingKey = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ── Delegation metadata store (spend tracking only) ───────────
const delegations = new Map<string, DelegationConfig>();
const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(key)) await locks.get(key);
  let release!: () => void;
  const promise = new Promise<void>((r) => { release = r; });
  locks.set(key, promise);
  try { return await fn(); }
  finally { locks.delete(key); release(); }
}

// ── Error helpers (Section 7.2) ───────────────────────────────
function err(code: string, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
function settleErr(code: string, message: string, network: string) {
  return { success: false, network, error: { code, message } };
}

const app = Fastify({ logger: false });

app.get('/health', async () => ({ status: 'ok' }));

// ===========================================================================
// Phase 0: Card Enrollment — real Stripe only
// ===========================================================================

app.post('/payments/card/setup', async () => {
  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ['card'],
  });
  console.log(`  [facilitator] Created SetupIntent: ${setupIntent.id}`);
  return { setupIntentId: setupIntent.id, clientSecret: setupIntent.client_secret };
});

app.post<{ Body: { setupIntentId: string } }>('/payments/card/enroll', async (_request, reply) => {
  try {
    // India export regulations require buyer name + billing address on the Customer
    const customer = await stripe.customers.create({
      name: 'AI Agent Demo User',
      address: {
        line1: '510 Townsend St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US',
      },
    });
    // Attach Stripe test card directly — no SetupIntent needed
    const attached = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    const pmId = attached.id;
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pmId },
    });
    console.log(`  [facilitator] Enrolled card: ${pmId} for customer ${customer.id}`);
    return { customerId: customer.id, paymentMethodId: pmId, status: 'enrolled' };
  } catch (e: any) {
    console.error('  [facilitator] Enroll error:', e.message || e);
    return reply.status(500).send(err('ENROLL_ERROR', e.message || String(e)));
  }
});

// ===========================================================================
// Phase 1: Delegation Creation
// ===========================================================================

app.post<{ Body: CreateDelegationRequest }>('/api/v1/delegation/create', async (request, reply) => {
  const body = request.body;
  const delegationId = `deleg-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);

  if (!body.provider) return reply.status(400).send(err('MISSING_PROVIDER', 'provider is required'));
  if (!body.currency) return reply.status(400).send(err('MISSING_CURRENCY', 'currency is required'));
  if (!body.subscriberAddress) {
    return reply.status(400).send(err('MISSING_SUBSCRIBER', 'subscriberAddress is required for on-chain credit operations'));
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.subscriberAddress)) {
    return reply.status(400).send(err('INVALID_ADDRESS', 'subscriberAddress must be a valid 0x-prefixed Ethereum address'));
  }

  if (!body.providerCustomerId) {
    return reply.status(400).send(err('MISSING_CUSTOMER', 'providerCustomerId is required (create one via /payments/card/enroll first)'));
  }

  const sessionKey = generateSessionKey(delegationId);

  const delegation: DelegationConfig = {
    delegationId,
    provider: body.provider,
    subscriberAddress: body.subscriberAddress,
    providerCustomerId: body.providerCustomerId,
    providerPaymentMethodId: body.providerPaymentMethodId,
    spendingLimitCents: body.spendingLimitCents,
    spentCents: 0,
    currency: body.currency,
    durationSecs: body.durationSecs,
    maxTransactions: body.maxTransactions,
    transactionCount: 0,
    merchantAccountId: body.merchantAccountId,
    planId: body.planId,
    createdAt: now,
    expiresAt: now + body.durationSecs,
    status: 'Active',
    sessionKeyHash: sessionKey.sessionKeyHash,
  };

  delegations.set(delegationId, delegation);
  console.log(`  [facilitator] Created delegation ${delegationId} for ${body.subscriberAddress}, limit=${body.spendingLimitCents}`);
  return reply.status(201).send({ delegationId, sessionKeyHash: sessionKey.sessionKeyHash });
});

app.get<{ Params: { delegationId: string } }>(
  '/api/v1/delegation/:delegationId',
  async (request, reply) => {
    const del = delegations.get(request.params.delegationId);
    if (!del) return reply.status(404).send(err('DELEGATION_NOT_FOUND', 'No delegation record found'));
    return {
      status: del.status,
      spentCents: del.spentCents,
      spendingLimitCents: del.spendingLimitCents,
      transactionCount: del.transactionCount,
      maxTransactions: del.maxTransactions,
      expiresAt: del.expiresAt,
      createdAt: del.createdAt,
      provider: del.provider,
      currency: del.currency,
      subscriberAddress: del.subscriberAddress,
    };
  },
);

app.post<{ Params: { delegationId: string } }>(
  '/api/v1/delegation/:delegationId/revoke',
  async (request, reply) => {
    const del = delegations.get(request.params.delegationId);
    if (!del) return reply.status(404).send(err('DELEGATION_NOT_FOUND', 'No delegation record found'));
    del.status = 'Revoked';
    return { success: true };
  },
);

// ===========================================================================
// Phase 1: x402 Access Token
// ===========================================================================

app.post<{
  Body: {
    resource: any;
    accepted: any;
    delegationConfig: { delegationId: string };
  };
}>('/x402/permissions', async (request, reply) => {
  const { delegationConfig, resource, accepted } = request.body;
  const del = delegations.get(delegationConfig.delegationId);

  if (!del) {
    return reply.status(404).send(err('DELEGATION_NOT_FOUND', 'No delegation record found for the given delegationId'));
  }
  if (del.status !== 'Active') {
    return reply.status(400).send(err('DELEGATION_INACTIVE',
      `Delegation status is '${del.status}', expected 'Active'`,
      { delegationId: del.delegationId, status: del.status }));
  }
  if (del.expiresAt < Math.floor(Date.now() / 1000)) {
    del.status = 'Expired';
    return reply.status(400).send(err('EXPIRED_TOKEN', 'The delegation expiry timestamp is in the past',
      { delegationId: del.delegationId, expiresAt: del.expiresAt }));
  }

  const now = Math.floor(Date.now() / 1000);

  const jwtPayload: DelegationJwt = {
    iss: FACILITATOR_URL,
    sub: del.subscriberAddress,
    aud: 'nvm:card-delegation',
    jti: del.delegationId,
    iat: now,
    exp: now + 3600,
    'nvm': {
      delegationId: del.delegationId,
      provider: del.provider,
      providerCustomerId: del.providerCustomerId,
      providerPaymentMethodId: del.providerPaymentMethodId,
      spendingLimitCents: del.spendingLimitCents,
      currency: del.currency,
      merchantAccountId: del.merchantAccountId,
      planId: del.planId,
      maxTransactions: del.maxTransactions,
    },
  };

  const token = jwt.sign(jwtPayload, signingKey.privateKey, { algorithm: 'RS256' });

  const paymentPayload: PaymentPayload = {
    x402Version: 2,
    resource,
    accepted,
    payload: {
      token,
      authorization: {
        from: del.subscriberAddress,
        sessionKeys: [{ id: 'redeem' as const, data: del.sessionKeyHash || '' }],
      },
    },
    extensions: {},
  };

  const accessToken = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  console.log(`  [facilitator] Signed JWT for delegation ${del.delegationId}`);

  return {
    accessToken,
    permissionHash: `0x${crypto.randomBytes(16).toString('hex')}`,
    sessionKeyHash: del.sessionKeyHash,
  };
});

// ===========================================================================
// Phase 2: Verification (Section 5)
// ===========================================================================

app.post<{ Body: { x402AccessToken: string; maxAmount?: string } }>(
  '/verify',
  async (request, reply) => {
    const { x402AccessToken } = request.body;

    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = JSON.parse(Buffer.from(x402AccessToken, 'base64').toString());
    } catch {
      return reply.status(400).send(err('INVALID_PAYLOAD', 'The payment payload structure is invalid or missing required fields'));
    }

    let jwtPayload: any;
    try {
      jwtPayload = jwt.verify(paymentPayload.payload.token, signingKey.publicKey, {
        algorithms: ['RS256'],
      });
    } catch {
      return reply.status(400).send(err('INVALID_TOKEN', 'The JWT token signature verification failed'));
    }

    if (jwtPayload.iss !== FACILITATOR_URL) {
      return reply.status(400).send(err('INVALID_ISSUER', `iss claim '${jwtPayload.iss}' does not match facilitator '${FACILITATOR_URL}'`));
    }
    if (jwtPayload.aud !== 'nvm:card-delegation') {
      return reply.status(400).send(err('INVALID_AUDIENCE', `aud claim must be 'nvm:card-delegation'`));
    }
    if (jwtPayload.iat > Math.floor(Date.now() / 1000)) {
      return reply.status(400).send(err('INVALID_IAT', 'iat claim is in the future'));
    }
    if (jwtPayload.exp < Math.floor(Date.now() / 1000)) {
      return reply.status(400).send(err('EXPIRED_TOKEN', 'The JWT token exp claim is in the past'));
    }

    const del = delegations.get(jwtPayload.jti);
    if (!del) {
      return reply.status(404).send(err('DELEGATION_NOT_FOUND', 'No delegation record found for the given jti/delegationId'));
    }
    if (del.status !== 'Active') {
      return reply.status(400).send(err('DELEGATION_INACTIVE',
        `Delegation status is '${del.status}', expected 'Active'`,
        { delegationId: del.delegationId, status: del.status }));
    }
    if (jwtPayload.nvm?.providerCustomerId !== del.providerCustomerId) {
      return reply.status(400).send(err('CUSTOMER_MISMATCH',
        'nvm.providerCustomerId does not match delegation record',
        { expected: del.providerCustomerId, received: jwtPayload.nvm?.providerCustomerId }));
    }
    if (jwtPayload.nvm?.providerPaymentMethodId !== del.providerPaymentMethodId) {
      return reply.status(400).send(err('PAYMENT_METHOD_MISMATCH',
        'nvm.providerPaymentMethodId does not match delegation record',
        { expected: del.providerPaymentMethodId, received: jwtPayload.nvm?.providerPaymentMethodId }));
    }
    if (del.maxTransactions && del.transactionCount >= del.maxTransactions) {
      del.status = 'Exhausted';
      return reply.status(400).send(err('TRANSACTION_LIMIT_REACHED',
        'The maximum number of transactions has been reached',
        { delegationId: del.delegationId, maxTransactions: del.maxTransactions }));
    }

    console.log(`  [facilitator] Verified delegation ${del.delegationId}`);
    return {
      valid: true,
      delegationId: del.delegationId,
      details: {
        spentCents: del.spentCents,
        spendingLimitCents: del.spendingLimitCents,
        transactionCount: del.transactionCount,
      },
    };
  },
);

// ===========================================================================
// Phase 3: Settlement — real Stripe + real on-chain (Section 6)
// ===========================================================================

app.post<{ Body: { x402AccessToken: string; maxAmount: string } }>(
  '/settle',
  async (request, reply) => {
    const { x402AccessToken, maxAmount } = request.body;

    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = JSON.parse(Buffer.from(x402AccessToken, 'base64').toString());
    } catch {
      return reply.status(400).send(settleErr('INVALID_PAYLOAD', 'The payment payload structure is invalid', 'stripe'));
    }

    let jwtPayload: any;
    try {
      jwtPayload = jwt.verify(paymentPayload.payload.token, signingKey.publicKey, {
        algorithms: ['RS256'],
      });
    } catch {
      return reply.status(400).send(settleErr('INVALID_TOKEN', 'The JWT token signature verification failed', 'stripe'));
    }

    const del = delegations.get(jwtPayload.jti);
    if (!del || del.status !== 'Active') {
      return reply.status(400).send(settleErr('DELEGATION_INACTIVE', 'Delegation is not active', del?.provider || 'stripe'));
    }
    if (jwtPayload.nvm?.providerCustomerId !== del.providerCustomerId) {
      return reply.status(400).send(settleErr('CUSTOMER_MISMATCH', 'Customer ID mismatch', del.provider));
    }

    const creditsRequested = parseInt(maxAmount);
    const storedAddress = del.subscriberAddress;

    return await withLock(del.delegationId, async () => {
      let currentBalance = await getCreditBalance(storedAddress);
      let orderTx: string | undefined;

      if (currentBalance < creditsRequested) {
        if (del.provider === 'erc4337') {
          console.log(`  [facilitator] Balance ${currentBalance} < ${creditsRequested}, no card on erc4337 provider`);
          return settleErr('INSUFFICIENT_BALANCE',
            `Credit balance ${currentBalance} is insufficient for requested ${creditsRequested} credits and no card top-up available for erc4337 provider`,
            del.provider);
        }

        console.log(`  [facilitator] Balance ${currentBalance} < ${creditsRequested}, auto top-up triggered`);
        const planPriceCents = 500;

        if (del.spentCents + planPriceCents > del.spendingLimitCents) {
          return settleErr('BUDGET_EXCEEDED',
            `Requested ${planPriceCents}c would exceed remaining delegation budget of ${del.spendingLimitCents - del.spentCents}c`,
            del.provider);
        }

        del.spentCents += planPriceCents;

        // Stripe charge — Connect routing (Section 6.4) + idempotency (Section 9.6)
        try {
          const piParams: any = {
            amount: planPriceCents,
            currency: del.currency,
            customer: del.providerCustomerId,
            payment_method: del.providerPaymentMethodId,
            off_session: true,
            confirm: true,
            description: 'PocketAgent AI agent task credit top-up',
          };
          if (del.merchantAccountId) {
            piParams.transfer_data = { destination: del.merchantAccountId };
          }
          const idemKey = `${del.delegationId}:${del.transactionCount}:${planPriceCents}`;
          const pi = await stripe.paymentIntents.create(piParams, { idempotencyKey: idemKey } as any);
          orderTx = pi.id;
          console.log(`  [facilitator] Stripe charge succeeded: ${pi.id}`);
        } catch (err: any) {
          del.spentCents -= planPriceCents; // rollback (Section 6.2)
          return settleErr(
            err.type === 'StripeCardError' ? 'CARD_DECLINED' : 'PAYMENT_FAILED',
            err.message || 'PSP PaymentIntent creation or confirmation failed',
            del.provider,
          );
        }

        // Mint credits on-chain (Section 6.1 step 5e)
        const mintedCredits = Math.floor(planPriceCents / 10);
        try {
          const mintTx = await mintCredits(storedAddress, mintedCredits);
          currentBalance = await getCreditBalance(storedAddress);
          console.log(`  [facilitator] On-chain mint: ${mintTx}, new balance: ${currentBalance}`);
        } catch (err: any) {
          return settleErr('MINT_FAILED',
            `Credit minting failed after successful card charge: ${err.message}`,
            del.provider);
        }
      }

      if (currentBalance < creditsRequested) {
        return settleErr('INSUFFICIENT_BALANCE',
          `Credit balance ${currentBalance} is insufficient for requested ${creditsRequested} credits`,
          del.provider);
      }

      let txHash: string;
      try {
        txHash = await burnCredits(storedAddress, creditsRequested);
        currentBalance = await getCreditBalance(storedAddress);
      } catch (err: any) {
        return settleErr('BURN_FAILED',
          `On-chain credit burn failed: ${err.message}`,
          del.provider);
      }

      del.transactionCount += 1;

      if (del.maxTransactions && del.transactionCount >= del.maxTransactions) {
        del.status = 'Exhausted';
      }

      console.log(`  [facilitator] Burned ${creditsRequested} credits, remaining: ${currentBalance}`);

      const receipt: SettlementReceipt = {
        success: true,
        network: del.provider,
        transaction: txHash,
        creditsRedeemed: String(creditsRequested),
        remainingBalance: String(currentBalance),
        orderTx,
      };

      return receipt;
    });
  },
);

// ===========================================================================
// Start
// ===========================================================================
const start = async () => {
  await app.register(import('@fastify/cors'), { origin: true });
  initOnChain();
  await app.listen({ port: PORT });
  console.log(`\n  [facilitator] Facilitator running on ${FACILITATOR_URL}`);
  console.log(`  [facilitator] Public key: ${signingKey.publicKey.slice(0, 60)}...\n`);
};

start();
