import { FacilitatorClient } from '../../facilitator/client.js';

interface InvokeOptions {
  delegation: string;
  prompt: string;
  agent: string;
}

export async function invoke(options: InvokeOptions) {
  const facilitator = new FacilitatorClient();
  const agentUrl = process.env.AGENT_SERVER_URL || 'http://localhost:3010';

  console.log(`[invoke] Calling agent ${options.agent}...`);

  const { accessToken } = await facilitator.getX402Permissions({
    resource: {
      url: `/api/v1/agents/${options.agent}/tasks`,
      description: 'AI agent task execution',
      mimeType: 'application/json',
    },
    accepted: {
      scheme: 'nvm:card-delegation',
      network: 'stripe',
      extra: { version: '1', agentId: options.agent, httpVerb: 'POST' },
    },
    delegationConfig: { delegationId: options.delegation },
  });

  const response = await fetch(`${agentUrl}/api/v1/agents/${options.agent}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-SIGNATURE': accessToken,
    },
    body: JSON.stringify({ prompt: options.prompt, maxCredits: 5 }),
  });

  const paymentResponse = response.headers.get('PAYMENT-RESPONSE');
  const data = await response.json();
  console.log(`  → Status: ${response.status}`);
  if (paymentResponse) {
    const decoded = JSON.parse(Buffer.from(paymentResponse, 'base64').toString());
    console.log(`  → Credits redeemed: ${decoded.creditsRedeemed}`);
    console.log(`  → Remaining balance: ${decoded.remainingBalance}`);
  }
  console.log(`  → Result: ${(data.result || JSON.stringify(data)).slice(0, 100)}...`);

  return data;
}
