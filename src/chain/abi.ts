/**
 * PocketAgentCredit ABI — manually maintained to match contracts/PocketAgentCredit.sol
 */

export const pocketAgentCreditAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'admin', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  {
    type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'mint', inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'burn', inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setMinter', inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setBurner', inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'minters', inputs: [{ type: 'address' }],
    outputs: [{ type: 'bool' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'burners', inputs: [{ type: 'address' }],
    outputs: [{ type: 'bool' }], stateMutability: 'view',
  },
  { type: 'function', name: 'transfer', inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }], stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'approve', inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }], stateMutability: 'nonpayable',
  },
  { type: 'event', name: 'Transfer', inputs: [
    { indexed: true, type: 'address' }, { indexed: true, type: 'address' }, { type: 'uint256' },
  ]},
  { type: 'event', name: 'Mint', inputs: [
    { indexed: true, type: 'address' }, { type: 'uint256' },
  ]},
  { type: 'event', name: 'Burn', inputs: [
    { indexed: true, type: 'address' }, { type: 'uint256' },
  ]},
] as const;
