import 'dotenv/config';

async function main() {
  const network = process.env.NETWORK || 'base-sepolia';
  const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
  const rawKey = (process.env.FACILITATOR_PRIVATE_KEY || '').trim();

  if (!rawKey) {
    console.error('FACILITATOR_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const { createWalletClient, createPublicClient, http } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { baseSepolia, sepolia } = await import('viem/chains');

  const chain = network === 'sepolia' ? sepolia : baseSepolia;
  const privateKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;
  if (privateKey.length !== 66) {
    console.error(`Invalid private key length (${privateKey.length - 2} hex chars). Expected 64 hex chars (32 bytes).`);
    process.exit(1);
  }
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  // ABI + bytecode for PocketAgentCredit
  // Compiled from contracts/PocketAgentCredit.sol
  const abi = [
    { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
    { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
    { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
    { type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
    { type: 'function', name: 'mint', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'burn', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'setMinter', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'setBurner', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  ] as const;

  // Compiled bytecode (minimal proxy-style deployment):
  // This is the initcode of the compiled PocketAgentCredit contract
  const bytecode = await getCompiledBytecode();

  console.log(`\n  Deploying PocketAgentCredit to ${network}...`);
  console.log(`  From: ${account.address}\n`);

  const hash: `0x${string}` = await (walletClient.deployContract as any)({
    abi,
    bytecode: bytecode as `0x${string}`,
  } as any);

  const receipt: any = await (publicClient.waitForTransactionReceipt as any)({ hash });
  const contractAddress = receipt.contractAddress;

  if (!contractAddress) {
    console.error('  Deployment failed — no contract address in receipt');
    process.exit(1);
  }

  console.log(`  ✓ Deployed at: ${contractAddress}`);
  console.log(`  Tx hash: ${hash}\n`);
  console.log(`  Add to your .env:`);
  console.log(`  CREDIT_TOKEN_ADDRESS=${contractAddress}`);
}

async function getCompiledBytecode(): Promise<string> {
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(__dirname, '..');
  const artifactPath = path.resolve(
    root,
    'artifacts/contracts/PocketAgentCredit.sol/PocketAgentCredit.json'
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    return artifact.bytecode;
  }

  console.log('  Compiling contract...');
  execSync('npx hardhat compile', { cwd: root, stdio: 'pipe' });

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    return artifact.bytecode;
  }

  throw new Error('Compilation produced no artifact');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
