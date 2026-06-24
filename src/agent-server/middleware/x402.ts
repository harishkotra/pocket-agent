import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PaymentRequired } from '../../types/x402.js';

function paymentRequiredResponse(request: FastifyRequest, reply: FastifyReply, error: string) {
  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    error,
    resource: {
      url: request.url,
      description: 'AI agent task execution',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'nvm:card-delegation',
        network: 'stripe',
        extra: { version: '1' },
      },
      {
        scheme: 'nvm:erc4337',
        network: 'erc4337',
        extra: { version: '1' },
      },
    ],
    extensions: {},
  };

  const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
  reply.header('PAYMENT-REQUIRED', encoded);
  return reply.status(402).send({ error, x402PaymentRequired: encoded });
}

export async function x402Verification(request: FastifyRequest, reply: FastifyReply) {
  const paymentSignature = request.headers['payment-signature'] as string | undefined;

  if (!paymentSignature) {
    return paymentRequiredResponse(request, reply, 'Payment required to access resource');
  }

  const facilitatorUrl = process.env.FACILITATOR_URL || 'http://localhost:3020';
  try {
    const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402AccessToken: paymentSignature,
        maxAmount: String(5),
      }),
    });

    const result = await verifyRes.json();

    // The new error format wraps it as: { error: { code: "...", message: "..." } }
    // but we also support the old flat format for backwards compatibility
    const errorMessage = result.error?.message || result.error || 'Verification failed';
    if (!result.valid) {
      return paymentRequiredResponse(request, reply, `Verification failed: ${errorMessage}`);
    }
  } catch (err: any) {
    return paymentRequiredResponse(request, reply, `Verification unavailable: ${err.message}`);
  }
}
