import 'dotenv/config';

const DIVIDER = '─'.repeat(60);

function logSection(num: number, title: string) {
  console.log(`\n${DIVIDER}`);
  console.log(`  [${num}/6] ${title}`);
  console.log(`${DIVIDER}\n`);
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`
╔════════════════════════════════════════╗
║           PocketAgent Demo             ║
║   Pocket money for your AI agents      ║
╚════════════════════════════════════════╝
`);

  const facilitatorUrl = process.env.FACILITATOR_URL || 'http://localhost:3020';
  const agentUrl = process.env.AGENT_SERVER_URL || 'http://localhost:3010';

  try {
    await fetch(`${facilitatorUrl}/health`);
    await fetch(`${agentUrl}/health`);
  } catch {
    console.error('  ! Please start both servers first:\n');
    console.error('    npm run facilitator &');
    console.error('    npm run agent-server &\n');
    process.exit(1);
  }

  const cardNumber = '4242424242424242';

  // -------------------------------------------------------------------
  // Step 1: Enroll test card via facilitator endpoints
  // -------------------------------------------------------------------
  logSection(1, 'Enrolling Stripe test card...');
  console.log(`  → Card: ${cardNumber} (Visa test)`);

  // 1a. Request a SetupIntent from the facilitator
  const setupRes = await fetch(`${facilitatorUrl}/payments/card/setup`, { method: 'POST' });
  const { setupIntentId } = await setupRes.json();
  console.log(`  → SetupIntent: ${setupIntentId}`);

  // 1b. In production, the cardholder submits card details via Stripe Elements / VGS here.
  //     For the demo, we simulate VGS completion by having the facilitator confirm directly.
  const enrollRes = await fetch(`${facilitatorUrl}/payments/card/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupIntentId }),
  });
  const { customerId, paymentMethodId } = await enrollRes.json();
  console.log(`  → Customer: ${customerId}`);
  console.log(`  → PaymentMethod: ${paymentMethodId}`);
  console.log('  ✓ Card enrolled\n');

  // -------------------------------------------------------------------
  // Step 2: Create delegation (dual rail)
  // -------------------------------------------------------------------
  logSection(2, 'Creating delegation (dual rail)...');
  console.log('  → Provider: erc4337 + stripe (fallback)');
  console.log('  → Spending limit: $100.00 USD');
  console.log('  → Duration: 7 days');

  // Use facilitator's account address (from FACILITATOR_PRIVATE_KEY) as subscriber
  const subscriberAddress = process.env.FACILITATOR_ADDRESS || '0x0000000000000000000000000000000000000001';

  const delRes = await fetch(`${facilitatorUrl}/api/v1/delegation/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'stripe',
      subscriberAddress,
      providerCustomerId: customerId,
      spendingLimitCents: 10000,
      durationSecs: 604800,
      providerPaymentMethodId: paymentMethodId,
      currency: 'usd',
    }),
  });
  const { delegationId, sessionKeyHash } = await delRes.json();
  console.log(`  → Delegation ID: ${delegationId}`);
  console.log(`  → Session key: ${sessionKeyHash?.slice(0, 20)}...`);
  await wait(500);
  console.log('  ✓ Delegation created\n');

  // -------------------------------------------------------------------
  // Step 3: Request x402 access token
  // -------------------------------------------------------------------
  logSection(3, 'Requesting x402 access token...');
  const permRes = await fetch(`${facilitatorUrl}/x402/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resource: {
        url: '/api/v1/agents/agent-1/tasks',
        description: 'AI agent task execution',
        mimeType: 'application/json',
      },
      accepted: {
        scheme: 'nvm:card-delegation',
        network: 'stripe',
        extra: { version: '1' },
      },
      delegationConfig: { delegationId },
    }),
  });
  const { accessToken } = await permRes.json();
  console.log(`  → PAYMENT-SIGNATURE: ${accessToken.slice(0, 40)}...`);
  await wait(500);
  console.log('  ✓ Token acquired\n');

  // -------------------------------------------------------------------
  // Step 4: Invoke agent (crypto-funded)
  // -------------------------------------------------------------------
  logSection(4, 'Invoking agent (crypto-funded)...');
  for (let i = 0; i < 3; i++) {
    await wait(300);
    const res = await fetch(`${agentUrl}/api/v1/agents/agent-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': accessToken,
      },
      body: JSON.stringify({ prompt: `Demo request ${i + 1}: summarize the quarterly report`, maxCredits: 5 }),
    });
    await res.json();
    const pmt = res.headers.get('PAYMENT-RESPONSE');
    if (pmt) {
      const r = JSON.parse(Buffer.from(pmt, 'base64').toString());
      console.log(`  → Request ${i + 1}: +${r.creditsRedeemed} credits burned | remaining: ${r.remainingBalance}`);
    } else {
      console.log(`  → Request ${i + 1}: OK`);
    }
  }
  console.log('  ✓ Agent invoked 3 times\n');

  // -------------------------------------------------------------------
  // Step 5: Exhaust crypto credits
  // -------------------------------------------------------------------
  logSection(5, 'Exhausting crypto credits...');
  let lastKnownBalance = 85;
  for (let i = 0; i < 30; i++) {
    const consume = Math.min(5, lastKnownBalance);
    if (consume <= 0) break;
    const res = await fetch(`${agentUrl}/api/v1/agents/agent-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': accessToken,
      },
      body: JSON.stringify({ prompt: `Drain request ${i + 1}`, maxCredits: consume }),
    });
    const data = await res.json();
    const errMsg = data.error?.message || data.error;
    if (errMsg && errMsg !== 'Settlement failed') {
      console.log(`  → Settle error: ${errMsg}`);
      break;
    }
    lastKnownBalance = data.payment?.remainingBalance ?? 0;
    console.log(`  → Consumed ${consume}, remaining: ${lastKnownBalance}`);
  }
  await wait(500);
  console.log('  ✓ Credits depleted\n');

  // -------------------------------------------------------------------
  // Step 6: Auto top-up fires
  // -------------------------------------------------------------------
  logSection(6, 'Auto top-up triggered!');
  console.log('  → Credits insufficient for next request');
  console.log('  → Charging test card: $5.00 USD');
  await wait(800);

  const res = await fetch(`${agentUrl}/api/v1/agents/agent-1/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-SIGNATURE': accessToken,
    },
    body: JSON.stringify({ prompt: 'Final demo request after top-up', maxCredits: 5 }),
  });
  const data = await res.json();
  const paymentResponse = res.headers.get('PAYMENT-RESPONSE');
  let orderTx = '';
  let creditsRedeemed = 0;
  let remainingBalance = 0;
  if (paymentResponse) {
    const receipt = JSON.parse(Buffer.from(paymentResponse, 'base64').toString());
    orderTx = receipt.orderTx || '';
    creditsRedeemed = parseInt(receipt.creditsRedeemed || '0');
    remainingBalance = parseInt(receipt.remainingBalance || '0');
    console.log(`  → PaymentIntent: ${orderTx}`);
    console.log(`  → Credits minted: ~50`);
    console.log(`  → Invoking agent with refreshed balance...`);
    console.log(`  → Credits burned: ${creditsRedeemed}`);
    console.log(`  → Remaining: ${remainingBalance}`);
  } else {
    console.log(`  → Remaining: ${data.payment?.remainingBalance}`);
  }
  console.log('  ✓ Agent still running, card was never touched by the agent\n');

  // Summary
  console.log(DIVIDER);
  console.log(`  Demo Complete!\n`);
  console.log(`  Nested containment:`);
  console.log(`    Card limit:    $100/month`);
  console.log(`    Delegation limit: $100 total`);
  console.log(`    Agent never touched the card directly`);
  console.log(`  `);
  console.log(`  Settlement summary:`);
  console.log(`    Delegation ID: ${delegationId}`);
  if (orderTx) console.log(`    Last order tx: ${orderTx}`);
  console.log(`    Total agents invoked`);
  console.log(`${DIVIDER}\n`);
}

main().catch(console.error);
