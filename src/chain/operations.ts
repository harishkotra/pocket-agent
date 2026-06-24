import { type ChainClients, toCredits, fromCredits, loadChainConfig, createChainClients } from './client.js';

let clients: ChainClients | null = null;

/**
 * Initialize on-chain mode. Call once at server startup.
 * Returns true if on-chain mode is active.
 */
export function initOnChain(): void {
  const config = loadChainConfig();
  if (!config) {
    throw new Error('On-chain mode requires CREDIT_TOKEN_ADDRESS, FACILITATOR_PRIVATE_KEY, and RPC_URL in .env');
  }
  clients = createChainClients(config);
  console.log(`  [chain] Connected to ${config.network}, contract: ${config.creditTokenAddress}`);
  console.log(`  [chain] Facilitator account: ${clients.account.address}`);
}

function requireClients(): void {
  if (!clients) throw new Error('on-chain not initialized — call initOnChain() first');
}

/** Fetch the on-chain credit balance for a subscriber address. Retries on stale reads. */
export async function getCreditBalance(address: `0x${string}`, retries = 3): Promise<number> {
  requireClients();
  for (let i = 0; i < retries; i++) {
    const balance: bigint = await (clients!.public.readContract as any)({
      ...clients!.contract,
      functionName: 'balanceOf',
      args: [address],
    } as any);
    const raw = balance.toString();
    const credits = fromCredits(balance);
    if (i > 0 || (credits === 0 && retries > 1)) {
      console.log(`  [chain] getCreditBalance[${i}] raw=${raw} credits=${credits}`);
    }
    if (credits > 0 || i === retries - 1) return credits;
    await new Promise(r => setTimeout(r, 1500));
  }
  return 0;
}

/** Mint credits to a subscriber address (only minter role can call). */
export async function mintCredits(address: `0x${string}`, amount: number): Promise<string> {
  requireClients();
  const hash: `0x${string}` = await (clients!.wallet.writeContract as any)({
    ...clients!.contract,
    functionName: 'mint',
    args: [address, toCredits(amount)],
  } as any);
  const receipt = await (clients!.public.waitForTransactionReceipt as any)({ hash });
  if (receipt.status !== 'success') {
    const msg = `Mint tx ${hash} reverted`;
    console.error(`  [chain] ${msg}`);
    throw new Error(msg);
  }
  console.log(`  [chain] Minted ${amount} credits to ${address.slice(0, 10)}... tx: ${hash}`);
  return hash;
}

/** Burn credits from a subscriber address (only burner role can call). */
export async function burnCredits(address: `0x${string}`, amount: number): Promise<string> {
  requireClients();
  const hash: `0x${string}` = await (clients!.wallet.writeContract as any)({
    ...clients!.contract,
    functionName: 'burn',
    args: [address, toCredits(amount)],
  } as any);
  const receipt = await (clients!.public.waitForTransactionReceipt as any)({ hash });
  if (receipt.status !== 'success') {
    const msg = `Burn tx ${hash} reverted`;
    console.error(`  [chain] ${msg}`);
    throw new Error(msg);
  }
  console.log(`  [chain] Burned ${amount} credits from ${address.slice(0, 10)}... tx: ${hash}`);
  return hash;
}
