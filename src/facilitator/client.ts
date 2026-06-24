import type {
  CreateDelegationRequest,
  CreateDelegationResponse,
  GetX402PermissionsRequest,
  GetX402PermissionsResponse,
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
} from '../types/delegation.js';

/**
 * Extracts a human-readable error message from any error response format.
 * The new format (Section 7.2) wraps errors as { error: { code, message, details } }.
 * The old format is { error: "CODE" } or { error: { code: "CODE" } }.
 */
function extractError(body: any, fallback: string): string {
  if (body?.error?.message) return body.error.message;
  if (body?.error?.code) return body.error.code;
  if (typeof body?.error === 'string') return body.error;
  return fallback;
}

export class FacilitatorClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.FACILITATOR_URL || 'http://localhost:3020';
  }

  async createDelegation(req: CreateDelegationRequest): Promise<CreateDelegationResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/delegation/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(extractError(body, 'DELEGATION_CREATE_FAILED'));
    }
    return res.json();
  }

  async getX402Permissions(req: GetX402PermissionsRequest): Promise<GetX402PermissionsResponse> {
    const res = await fetch(`${this.baseUrl}/x402/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(extractError(body, 'PERMISSIONS_FAILED'));
    }
    return res.json();
  }

  async verify(req: VerifyRequest): Promise<VerifyResponse> {
    const res = await fetch(`${this.baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return res.json();
  }

  async settle(req: SettleRequest): Promise<SettleResponse> {
    const res = await fetch(`${this.baseUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return res.json();
  }

  async getDelegationStatus(delegationId: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/delegation/${delegationId}`);
    if (!res.ok) throw new Error('DELEGATION_NOT_FOUND');
    return res.json();
  }

  async revokeDelegation(delegationId: string) {
    const res = await fetch(`${this.baseUrl}/api/v1/delegation/${delegationId}/revoke`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('REVOKE_FAILED');
  }

  // --- Phase 0: Card enrollment ---

  async createSetupIntent(): Promise<{ setupIntentId: string; clientSecret: string }> {
    const res = await fetch(`${this.baseUrl}/payments/card/setup`, { method: 'POST' });
    if (!res.ok) throw new Error('SETUP_INTENT_FAILED');
    return res.json();
  }

  async enrollCard(setupIntentId: string): Promise<{ customerId: string; paymentMethodId: string }> {
    const res = await fetch(`${this.baseUrl}/payments/card/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupIntentId }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(extractError(body, 'ENROLL_FAILED'));
    }
    return res.json();
  }
}
