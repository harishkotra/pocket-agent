# PocketAgent

> **Pocket money for your AI agents.**

A working reference implementation of the [Nevermined x402 Delegation Extension](https://docs.nevermined.app/specs/x402/card-delegation) — delegate a Stripe card to an AI agent with dual-rail (on-chain credits + fiat auto top-up), all self-hosted.

```
Bank Account
  └── Delegation ($100 limit, 7 days)
        └── AI Agent (spends autonomously via x402)
```

When on-chain credits run low, the delegated card auto-charges and mints more. The agent never touches the card directly.

---

## How This Implements the x402 Delegation Extension

The project follows the spec's 4-phase protocol, fully self-hosted (no dependency on Nevermined's cloud facilitator).

### Phase 0: Card Enrollment (Section 4.2)

A user enrolls a Stripe test card via the facilitator, producing a `Customer` + `PaymentMethod`:

```typescript
// Client requests a SetupIntent
const setupRes = await fetch(`${facilitatorUrl}/payments/card/setup`, { method: 'POST' });
const { setupIntentId } = await setupRes.json();

// Facilitator attaches a test PaymentMethod and creates a Customer
const enrollRes = await fetch(`${facilitatorUrl}/payments/card/enroll`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ setupIntentId }),
});
const { customerId, paymentMethodId } = await enrollRes.json();
```

### Phase 1: Delegation Creation (Section 4.2)

The user creates a delegation — a config object that grants spending authority:

```typescript
const delRes = await fetch(`${facilitatorUrl}/api/v1/delegation/create`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'stripe',
    subscriberAddress: '0x...',
    providerCustomerId: 'cus_...',
    providerPaymentMethodId: 'pm_...',
    spendingLimitCents: 10000,
    durationSecs: 604800,
    currency: 'usd',
    merchantAccountId: 'acct_...',   // Stripe Connect (Section 6.4)
  }),
});
const { delegationId, sessionKeyHash } = await delRes.json();
```

The delegation is stored in-memory with a `sessionKeyHash` for authorization, plus `transactionCount`, `spentCents`, and `expiresAt` for enforcement.

### Phase 2: Access Token (Verification Pre-check, Section 5)

The facilitator verifies the delegation and issues a JWT access token:

```typescript
const permRes = await fetch(`${facilitatorUrl}/x402/permissions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resource: { url: '/api/v1/agents/agent-1/tasks', description: 'AI task', mimeType: 'application/json' },
    accepted: { scheme: 'nvm:card-delegation', network: 'stripe', extra: { version: '1' } },
    delegationConfig: { delegationId },
  }),
});
const { accessToken } = await permRes.json();
```

The JWT carries `nvm`-namespaced claims per Section 3.3:

```typescript
const token = jwt.sign(
  {
    sub: delegation.subscriberAddress,
    iss: 'pocket-agent',
    aud: delegation.provider,
    exp: delegation.expiresAt,
    iat: Math.floor(Date.now() / 1000),
    nvm: {
      delegationId: delegation.delegationId,
      provider: delegation.provider,
      spendingLimitCents: delegation.spendingLimitCents,
      spentCents: delegation.spentCents,
    },
  },
  privateKey,
  { algorithm: 'RS256' },
);
```

### Phase 2-3: Agent Invocation → Verify → Settle (Sections 4.2, 6)

The agent server's x402 middleware (in `src/agent-server/middleware/x402.ts`) intercepts every request:

**Verification (Section 5):**
- `INVALID_TOKEN` — JWT malformed or wrong algorithm
- `EXPIRED_TOKEN` — `exp` timestamp passed
- `DELEGATION_NOT_FOUND` — delegation id not in storage
- `DELEGATION_INACTIVE` — delegation revoked or exhausted
- `TRANSACTION_LIMIT_REACHED` — transaction count exceeded
- `BUDGET_EXCEEDED` — spending limit reached

**Settlement (Section 6.1):**
1. Credits exist on-chain? → burn them (no fiat)
2. Credits insufficient? → auto-charge card → mint credits → burn
3. Duplicate? → idempotency key prevents double-charge (Section 9.6)
4. Error? → spec-compliant error code: `CARD_DECLINED`, `PAYMENT_FAILED`, `MINT_FAILED`, `BURN_FAILED`, `INSUFFICIENT_BALANCE`

```typescript
// In the x402 middleware, after verification succeeds:
const settleRes = await fetch(`${facilitatorUrl}/settle`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    delegationId,
    credits: maxCredits,
    paymentSignature: accessToken,
  }),
});

// Facilitator returns a SettlementReceipt:
// {
//   success: true,
//   network: 'stripe',
//   transaction: '0x...',       // on-chain burn tx hash
//   creditsRedeemed: '5',
//   remainingBalance: '45',
//   orderTx: 'pi_3Tl...',       // Stripe PaymentIntent id (if fiat top-up fired)
// }

// Receipt is base64-encoded in the PAYMENT-RESPONSE header
res.header('PAYMENT-RESPONSE', Buffer.from(JSON.stringify(receipt)).toString('base64'));
```

### Stripe Connect Routing (Section 6.4)

When a delegation has a `merchantAccountId`, the PaymentIntent routes funds through Stripe Connect:

```typescript
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
```

### Idempotency (Section 9.6)

Charge requests are idempotent per delegation + transaction count:

```typescript
const idemKey = `${del.delegationId}:${del.transactionCount}:${planPriceCents}`;
const pi = await stripe.paymentIntents.create(piParams, { idempotencyKey: idemKey });
```

---

## Architecture

```
┌─────────────┐     create delegation      ┌──────────────────┐
│  Web UI /    │ ─────────────────────────> │  Mock Facilitator │
│  CLI / Demo  │                            │  (port 3020)     │
│              │ <──── x402 access token ── │  · Stripe API     │
│              │                            │  · On-chain via   │
│              │ ── PAYMENT-SIGNATURE ────> │    viem (viem)    │
│              │    header + prompt         │  · JWT sign/verify │
│              │                            │  · Delegation CRUD │
│              │ <─── PAYMENT-RESPONSE ──── │  · Auto top-up     │
│              │     + task result          └──────────────────┘
└─────────────┘
```

| Component | Location | Role |
|---|---|---|
| **Web UI** | `src/agent-server/public/index.html` | Wallet-connected interactive demo (served by agent server) |
| **Facilitator** | `src/facilitator/mock-server.ts` | Delegation CRUD, JWT signing, verify, settle, auto top-up. Real Stripe + real on-chain via viem |
| **Agent Server** | `src/agent-server/index.ts` | Protected x402 endpoint, serves Web UI, forwards settle to facilitator |
| **x402 Middleware** | `src/agent-server/middleware/x402.ts` | Per-spec verification + settlement forwarding |
| **CLI** | `src/index.ts` | 6 Commander-based commands |
| **Demo** | `src/demo.ts` | Automated 6-step e2e script |
| **On-chain** | `src/chain/` | PocketAgentCredit ABI, viem clients, credit mint/burn with retry |
| **Types** | `src/types/` | `PaymentPayload`, `DelegationConfig`, `SettlementReceipt` matching spec |

---

## Use This as a Template for Your Agent Ideas

This project is a complete, runnable template for any AI agent that needs to accept payments autonomously. Here's how to make it yours:

### Fork and Customize

```bash
git clone <your-fork>
npm install
cp .env.example .env
# Fill in your Stripe key, contract address, etc.
```

Then swap out the agent logic in `src/agent-server/mock-executor.ts` — it's a 30-line placeholder that echoes back your prompt. Replace it with your own AI logic:

```typescript
// Instead of the mock executor, call your AI model:
import OpenAI from 'openai';
const openai = new OpenAI();

async function executeTask(prompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  return completion.choices[0].message.content;
}
```

### Agent Ideas You Can Build

| Agent Idea | How PocketAgent Helps |
|---|---|
| **Research agent** — fetches web data, summarizes, emails reports | Crypto credits cover per-query costs; auto top-up keeps it running without manual refill |
| **Social media scheduler** — posts, monitors replies, generates content | Delegation limits prevent runaway spend; Stripe Connect routes revenue to your Stripe account |
| **Code review bot** — reviews PRs in your repo | Per-review credit cost + monthly card limit = predictable pricing |
| **Trading signal generator** — analyzes markets, sends alerts | Dual rail: crypto for fast micro-transactions, fiat for larger monthly settlements |
| **Personal assistant** — manages calendar, drafts emails, books appointments | User delegates a card with their own spending limit; agent handles variable usage |
| **NFT metadata generator** — creates art + metadata on demand | Stripe Connect routes creator payouts; facilitator handles the fiat↔crypto bridge |

### Key Points for Your Own Agent

- **The agent never touches the payment card.** The x402 delegation model means the user's card is stored at Stripe, not the agent. The facilitator mediates all charges.
- **Crypto credits are optional.** If you don't need on-chain accounting, remove the mint/burn calls and just use the Stripe charge — the delegation model still protects the user's card.
- **Switch between self-hosted and Nevermined cloud.** In `.env`, point `FACILITATOR_URL` to Nevermined's hosted facilitator (`https://facilitator.sandbox.nevermined.app`) to offload verification and settlement.
- **Add your own provider.** The delegation config accepts any `provider` string. Add Braintree, Visa TAP, or a custom PSP by implementing the settlement handler in the facilitator.

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Stripe test key** — free at [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)
- **Smart contract** — deploy `contracts/PocketAgentCredit.sol` (or use an existing ERC20 burnable token)
- **RPC URL** — e.g. `https://sepolia.base.org`

### Setup

```bash
npm install
cp .env.example .env
# Edit .env — see below
```

Your `.env` must have:

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe test secret key (`sk_test_...`) |
| `RPC_URL` | Base Sepolia or Sepolia RPC endpoint |
| `CREDIT_TOKEN_ADDRESS` | Deployed contract address |
| `FACILITATOR_PRIVATE_KEY` | Wallet with MINTER+BURNER role |
| `FACILITATOR_ADDRESS` | Corresponding address |

### Run

```bash
# Start both servers
npm start

# Open: http://localhost:3010
# Connect MetaMask → Enroll a test card → Create delegation → Invoke the agent

# Or run the CLI demo:
npm run demo
```

### Commands

```bash
# Phase 0
npx tsx src/index.ts enroll-card
npx tsx src/index.ts confirm-enroll <setupIntentId>

# Phase 1
npx tsx src/index.ts create-delegation --provider stripe --limit 10000

# Phase 2-3
npx tsx src/index.ts invoke --delegation <id> --prompt "hello"

# Management
npx tsx src/index.ts balance --delegation <id>
npx tsx src/index.ts revoke --delegation <id>
```

---

## Spec Compliance

| Section | Feature | Status |
|---|---|---|
| 3.1 | Scheme `nvm:card-delegation` | ✅ |
| 3.2 | `PaymentPayload` + `PaymentRequired` structures | ✅ |
| 3.3 | JWT with `nvm` claims | ✅ |
| 4.2 | All 4 protocol phases | ✅ |
| 4.3 | `PAYMENT-*` HTTP headers | ✅ |
| 5 | Verification checks (6 error codes) | ✅ |
| 6.1 | Atomic settle (charge → mint → burn) | ✅ |
| 6.2 | Spend counter rollback on failure | ✅ |
| 6.3 | Delegation lifecycle | ✅ |
| 6.4 | Stripe Connect routing | ✅ |
| 6.5 | Settlement receipt format | ✅ |
| 7 | All critical error codes | ✅ |
| 9.6 | Idempotency keys | ✅ |

See the [full spec](https://docs.nevermined.app/specs/x402/card-delegation) for details.

---

## License

MIT

---

<p align="center">
  Built by <a href="https://harishkotra.me">Harish Kotra</a> ·
  Check out my other builds at <a href="https://dailybuild.xyz">dailybuild.xyz</a>
</p>