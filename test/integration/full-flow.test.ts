import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function waitForServer(url: string, label: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${label} did not start within ${timeoutMs}ms`);
}

describe('full flow (e2e)', () => {
  let facilitator: ChildProcess;
  let agentServer: ChildProcess;

  beforeAll(async () => {
    facilitator = spawn('npx', ['tsx', 'src/facilitator/mock-server.ts'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, FACILITATOR_PORT: '3021', AGENT_SERVER_PORT: '3011' },
    });
    agentServer = spawn('npx', ['tsx', 'src/agent-server/index.ts'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, FACILITATOR_URL: 'http://localhost:3021', AGENT_SERVER_PORT: '3011' },
    });

    await waitForServer('http://localhost:3021/health', 'facilitator');
    await waitForServer('http://localhost:3011/health', 'agent-server');
  }, 15000);

  afterAll(() => {
    facilitator.kill();
    agentServer.kill();
  });

  it('should run the complete flow: enroll → create → token → invoke → settle', async () => {
    const facilitatorUrl = 'http://localhost:3021';
    const agentUrl = 'http://localhost:3011';

    // --- Step 1: Enroll card ---
    const setupRes = await fetch(`${facilitatorUrl}/payments/card/setup`, { method: 'POST' });
    expect(setupRes.ok).toBe(true);
    const { setupIntentId } = await setupRes.json();
    expect(setupIntentId).toBeTruthy();

    const enrollRes = await fetch(`${facilitatorUrl}/payments/card/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupIntentId }),
    });
    expect(enrollRes.ok).toBe(true);
    const { customerId, paymentMethodId } = await enrollRes.json();
    expect(customerId).toBeTruthy();
    expect(paymentMethodId).toBeTruthy();

    // --- Step 2: Create delegation ---
    const subscriberAddress = (process.env.FACILITATOR_ADDRESS || '0x0000000000000000000000000000000000000001') as `0x${string}`;
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
    expect(delRes.ok).toBe(true);
    const { delegationId } = await delRes.json();
    expect(delegationId).toMatch(/^deleg-/);

    // --- Step 3: Get x402 access token ---
    const permRes = await fetch(`${facilitatorUrl}/x402/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource: { url: '/api/v1/agents/agent-1/tasks', description: 'test', mimeType: 'application/json' },
        accepted: { scheme: 'nvm:card-delegation', network: 'stripe', extra: { version: '1' } },
        delegationConfig: { delegationId },
      }),
    });
    expect(permRes.ok).toBe(true);
    const { accessToken } = await permRes.json();
    expect(accessToken).toBeTruthy();

    // --- Step 4: Invoke agent (first call — crypto funded) ---
    const task1 = await fetch(`${agentUrl}/api/v1/agents/agent-1/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': accessToken,
      },
      body: JSON.stringify({ prompt: 'Test invocation', maxCredits: 5 }),
    });
    expect(task1.ok).toBe(true);
    const receiptHeader1 = task1.headers.get('PAYMENT-RESPONSE');
    expect(receiptHeader1).toBeTruthy();
    const receipt1 = JSON.parse(Buffer.from(receiptHeader1!, 'base64').toString());
    expect(receipt1.success).toBe(true);
    expect(parseInt(receipt1.creditsRedeemed)).toBe(5);

    // --- Step 5: Invoke 18 more times to exhaust credits ---
    for (let i = 0; i < 19; i++) {
      const r = await fetch(`${agentUrl}/api/v1/agents/agent-1/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': accessToken,
        },
        body: JSON.stringify({ prompt: `Drain ${i + 1}`, maxCredits: 5 }),
      });
      // After exhaustion (100 - 20*5 = 0), the next call triggers auto top-up.
      // We just need calls to succeed or return payment info.
      const pmt = r.headers.get('PAYMENT-RESPONSE');
      if (pmt) {
        const rcpt = JSON.parse(Buffer.from(pmt, 'base64').toString());
        if (!r.ok) {
          // Expected: auto top-up may fail if spending limit reached, etc.
          break;
        }
      }
    }

    // --- Step 6: Verify delegation status ---
    const statusRes = await fetch(`${facilitatorUrl}/api/v1/delegation/${delegationId}`);
    expect(statusRes.ok).toBe(true);
    const status = await statusRes.json();
    expect(status.transactionCount).toBeGreaterThan(0);
  }, 30000);
});
