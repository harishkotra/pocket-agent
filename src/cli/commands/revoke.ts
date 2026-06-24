import { FacilitatorClient } from '../../facilitator/client.js';

export async function revokeDelegation(delegationId: string) {
  const facilitator = new FacilitatorClient();
  console.log(`[revoke] Revoking delegation ${delegationId}...`);
  await facilitator.revokeDelegation(delegationId);
  console.log(`  ✓ Delegation revoked`);
}
