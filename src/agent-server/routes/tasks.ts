import type { FastifyInstance } from 'fastify';
import { x402Verification } from '../middleware/x402.js';
import { executeTask } from '../mock-executor.js';

export async function taskRoutes(app: FastifyInstance) {
  app.post<{
    Params: { agentId: string };
    Body: { prompt: string; maxCredits?: number };
  }>(
    '/api/v1/agents/:agentId/tasks',
    { preHandler: [x402Verification] },
    async (request, reply) => {
      const { agentId } = request.params;
      const { prompt, maxCredits = 5 } = request.body;

      console.log(`  [agent-server] Executing task for agent ${agentId}: "${prompt.slice(0, 50)}..."`);

      // Execute the AI task
      const { result, creditsUsed } = await executeTask(agentId, prompt, maxCredits);

      // Call facilitator to settle
      const accessToken = request.headers['payment-signature'] as string;
      const facilitatorUrl = process.env.FACILITATOR_URL || 'http://localhost:3020';

      let settlementReceipt: any;
      try {
        const settleRes = await fetch(`${facilitatorUrl}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x402AccessToken: accessToken,
            maxAmount: String(maxCredits),
          }),
        });
        settlementReceipt = await settleRes.json();

        if (!settlementReceipt.success) {
          return reply.status(402).send({
            error: settlementReceipt.error?.message || 'Settlement failed',
            payment: settlementReceipt,
          });
        }
      } catch (err: any) {
        console.error('  [agent-server] Settlement error:', err.message);
        return reply.status(502).send({ error: { code: 'SETTLEMENT_UNAVAILABLE', message: 'Settlement service unavailable' } });
      }

      // Base64-encode PAYMENT-RESPONSE per Section 4.3
      const paymentResponse = Buffer.from(JSON.stringify(settlementReceipt)).toString('base64');
      reply.header('PAYMENT-RESPONSE', paymentResponse);

      return {
        result,
        creditsUsed,
        payment: {
          creditsRedeemed: parseInt(settlementReceipt.creditsRedeemed || '0'),
          remainingBalance: parseInt(settlementReceipt.remainingBalance || '0'),
          orderTx: settlementReceipt.orderTx,
        },
      };
    },
  );
}
