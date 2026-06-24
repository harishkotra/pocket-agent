export const X402_VERSION = 2 as const;

export interface Resource {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface SchemeExtra {
  version: string;
  agentId?: string;
  httpVerb?: string;
}

export interface AcceptedScheme {
  scheme: 'nvm:card-delegation' | 'nvm:erc4337';
  network: 'stripe' | 'erc4337' | 'visa' | 'braintree';
  planId?: string;
  extra: SchemeExtra;
}

export interface SessionKey {
  id: 'redeem';
  data: string;
}

export interface Authorization {
  from: string;
  sessionKeys: SessionKey[];
}

export interface PaymentPayload {
  x402Version: typeof X402_VERSION;
  resource?: Resource;
  accepted: AcceptedScheme;
  payload: {
    token: string;
    authorization?: Authorization;
  };
  extensions: Record<string, never>;
}

export interface PaymentRequired {
  x402Version: typeof X402_VERSION;
  error: string;
  resource: Resource;
  accepts: AcceptedScheme[];
  extensions: Record<string, never>;
}

export interface SettlementReceipt {
  success: boolean;
  network: 'stripe' | 'erc4337' | 'visa' | 'braintree';
  transaction?: string;
  creditsRedeemed?: string;
  remainingBalance?: string;
  orderTx?: string;
}

export type DelegationStatus = 'Active' | 'Exhausted' | 'Expired' | 'Revoked';

export type ProviderType = 'stripe' | 'braintree' | 'visa' | 'erc4337';
