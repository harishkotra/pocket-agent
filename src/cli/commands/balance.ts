import { FacilitatorClient } from '../../facilitator/client.js';

export async function checkBalance(delegationId: string) {
  const facilitator = new FacilitatorClient();
  console.log(`[balance] Checking delegation ${delegationId}...`);
  const status = await facilitator.getDelegationStatus(delegationId);
  console.log(`  → Status: ${status.status}`);
  console.log(`  → Spent: ${status.spentCents} / ${status.spendingLimitCents} cents`);
  console.log(`  → Transactions: ${status.transactionCount}${status.maxTransactions ? ` / ${status.maxTransactions}` : ''}`);
  console.log(`  → Expires: ${new Date(status.expiresAt * 1000).toISOString()}`);
}
