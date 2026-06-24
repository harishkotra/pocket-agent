import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, sepolia } from 'viem/chains';
import { pocketAgentCreditAbi } from './abi.js';

export interface ChainConfig {
  rpcUrl: string;
  network: 'base-sepolia' | 'sepolia';
  creditTokenAddress: `0x${string}`;
  facilitatorPrivateKey: `0x${string}`;
}

export interface ChainClients {
  public: ReturnType<typeof createPublicClient>;
  wallet: ReturnType<typeof createWalletClient>;
  account: ReturnType<typeof privateKeyToAccount>;
  contract: { address: `0x${string}`; abi: typeof pocketAgentCreditAbi };
  chainId: number;
  isConfigured: boolean;
}

/**
 * Load chain configuration from environment variables.
 * Returns null if not configured (caller falls back to in-memory mode).
 */
export function loadChainConfig(): ChainConfig | null {
  const rpcUrl = process.env.RPC_URL;
  const network = (process.env.NETWORK || 'base-sepolia') as ChainConfig['network'];
  const creditTokenAddress = process.env.CREDIT_TOKEN_ADDRESS as `0x${string}` | undefined;
  const rawKey = process.env.FACILITATOR_PRIVATE_KEY;

  if (!rpcUrl || !creditTokenAddress || !rawKey) {
    return null;
  }

  const facilitatorPrivateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  return { rpcUrl, network, creditTokenAddress, facilitatorPrivateKey };
}

/**
 * Create viem clients for on-chain interactions.
 */
export function createChainClients(config: ChainConfig): ChainClients {
  const chain = config.network === 'sepolia' ? sepolia : baseSepolia;
  const account = privateKeyToAccount(config.facilitatorPrivateKey);

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });

  return {
    public: publicClient as any,
    wallet: walletClient as any,
    account,
    contract: { address: config.creditTokenAddress, abi: pocketAgentCreditAbi },
    chainId: chain.id,
    isConfigured: true,
  } as ChainClients;
}

/**
 * Convert a human-readable credit amount (whole tokens) to wei.
 * PocketAgentCredit uses 18 decimals.
 */
export function toCredits(amount: number): bigint {
  return BigInt(amount) * 10n ** 18n;
}

/**
 * Convert wei back to human-readable credit amount.
 */
export function fromCredits(wei: bigint): number {
  return Number(wei / 10n ** 18n);
}
