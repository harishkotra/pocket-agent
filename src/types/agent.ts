export interface TaskRequest {
  prompt: string;
  maxCredits?: number;
}

export interface TaskResult {
  result: string;
  creditsUsed: number;
  payment: {
    creditsRedeemed: number;
    remainingBalance: number;
    orderTx?: string;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  creditsPerCharge: number;
  model: string;
}
