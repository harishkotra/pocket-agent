import type { DelegationStatus, ProviderType } from './x402.js';

export interface DelegationConfig {
  delegationId: string;
  provider: ProviderType;
  subscriberAddress: `0x${string}`;
  providerCustomerId: string;
  providerPaymentMethodId: string;
  spendingLimitCents: number;
  spentCents: number;
  currency: string;
  durationSecs: number;
  maxTransactions?: number;
  transactionCount: number;
  merchantAccountId?: string;
  planId?: string;
  vgsIntentId?: string;
  createdAt: number;
  expiresAt: number;
  status: DelegationStatus;
  consumerPrompt?: string;
  assuranceData?: unknown;
  sessionKeyHash?: string;
}

export interface CreateDelegationRequest {
  provider: ProviderType;
  subscriberAddress: `0x${string}`;
  providerCustomerId: string;
  spendingLimitCents: number;
  durationSecs: number;
  providerPaymentMethodId: string;
  currency: string;
  maxTransactions?: number;
  merchantAccountId?: string;
  planId?: string;
  consumerPrompt?: string;
  assuranceData?: unknown;
}

export interface CreateDelegationResponse {
  delegationId: string;
  sessionKeyHash?: string;
}

export interface DelegationJwtNvm {
  delegationId: string;
  provider: ProviderType;
  providerCustomerId: string;
  providerPaymentMethodId: string;
  spendingLimitCents: number;
  currency: string;
  merchantAccountId?: string;
  planId?: string;
  maxTransactions?: number;
  vgsIntentId?: string;
}

export interface DelegationJwt {
  iss: string;
  sub: string;
  aud: string;
  jti: string;
  iat: number;
  exp: number;
  'nvm': DelegationJwtNvm;
}

export interface GetX402PermissionsRequest {
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepted: {
    scheme: 'nvm:card-delegation' | 'nvm:erc4337';
    network: ProviderType;
    planId?: string;
    extra: { version: string; agentId?: string; httpVerb?: string };
  };
  delegationConfig: {
    delegationId: string;
  };
}

export interface GetX402PermissionsResponse {
  accessToken: string;
  permissionHash?: string;
}

export interface VerifyRequest {
  x402AccessToken: string;
  maxAmount?: string;
}

export interface VerifyResponse {
  valid: boolean;
  delegationId?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface SettleRequest {
  x402AccessToken: string;
  maxAmount: string;
}

export interface SettleResponse {
  success: boolean;
  creditsRedeemed?: string;
  remainingBalance?: string;
  orderTx?: string;
  transaction?: string;
  error?: string;
  network: ProviderType;
}
