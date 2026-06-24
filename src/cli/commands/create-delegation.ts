import { FacilitatorClient } from '../../facilitator/client.js';

interface CreateDelegationOptions {
  provider: string;
  limit: string;
  duration: string;
  currency: string;
  subscriber?: string;
  customer?: string;
  paymentMethod?: string;
}

export async function createDelegation(options: CreateDelegationOptions) {
  const facilitator = new FacilitatorClient();
  console.log(`[create-delegation] Provider: ${options.provider}, Limit: ${options.limit} cents`);

  const subscriberAddress = (options.subscriber || process.env.FACILITATOR_ADDRESS) as `0x${string}`;
  if (!subscriberAddress) {
    console.error('  ! --subscriber <address> or FACILITATOR_ADDRESS env var is required');
    process.exit(1);
  }

  if (!options.customer) {
    console.error('  ! --customer <cus_xxx> is required (get one via `enroll-card`)');
    process.exit(1);
  }
  if (!options.paymentMethod) {
    console.error('  ! --payment-method <pm_xxx> is required (get one via `enroll-card`)');
    process.exit(1);
  }

  const { delegationId, sessionKeyHash } = await facilitator.createDelegation({
    provider: options.provider as any,
    subscriberAddress,
    providerCustomerId: options.customer,
    spendingLimitCents: parseInt(options.limit),
    durationSecs: parseInt(options.duration),
    providerPaymentMethodId: options.paymentMethod,
    currency: options.currency,
  });
  console.log(`  → Delegation ID: ${delegationId}`);
  if (sessionKeyHash) {
    console.log(`  → Session key: ${sessionKeyHash.slice(0, 20)}...`);
  }

  const { accessToken } = await facilitator.getX402Permissions({
    resource: {
      url: '/api/v1/agents/agent-1/tasks',
      description: 'AI agent task execution',
      mimeType: 'application/json',
    },
    accepted: {
      scheme: 'nvm:card-delegation',
      network: options.provider as any,
      extra: { version: '1' },
    },
    delegationConfig: { delegationId },
  });
  console.log(`  → x402 access token acquired`);

  return { delegationId, accessToken };
}
