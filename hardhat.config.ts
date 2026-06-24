import type { HardhatUserConfig } from 'hardhat/config';
import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem';

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    'base-sepolia': {
      type: 'http' as const,
      url: process.env.RPC_URL || 'https://sepolia.base.org',
      accounts: process.env.FACILITATOR_PRIVATE_KEY ? [`0x${process.env.FACILITATOR_PRIVATE_KEY.replace('0x', '')}`] : [],
    },
    sepolia: {
      type: 'http' as const,
      url: process.env.RPC_URL || 'https://rpc.sepolia.org',
      accounts: process.env.FACILITATOR_PRIVATE_KEY ? [`0x${process.env.FACILITATOR_PRIVATE_KEY.replace('0x', '')}`] : [],
    },
  },
};

export default config;
