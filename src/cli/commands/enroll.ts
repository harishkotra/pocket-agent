import { FacilitatorClient } from '../../facilitator/client.js';

export async function enrollCard(cardNumber: string) {
  const facilitator = new FacilitatorClient();
  console.log(`[enroll-card] Enrolling card ending in ${cardNumber.slice(-4)}...`);

  // Step 1: Request SetupIntent from facilitator
  const { setupIntentId, clientSecret } = await facilitator.createSetupIntent();
  console.log(`  → SetupIntent: ${setupIntentId}`);
  console.log(`  → client_secret: ${clientSecret.slice(0, 20)}...`);

  // Step 2: In production, submit card details via Stripe Elements / VGS here.
  // For the CLI, we simulate by calling the facilitator to confirm directly.
  console.log(`  → Submitting card data (simulated via VGS)...`);
  const { customerId, paymentMethodId } = await facilitator.enrollCard(setupIntentId);
  console.log(`  → Customer: ${customerId}`);
  console.log(`  → PaymentMethod: ${paymentMethodId}`);
  console.log(`  ✓ Card enrolled successfully`);
  return { customerId, paymentMethodId };
}

export async function confirmEnroll(setupIntentId: string) {
  const facilitator = new FacilitatorClient();
  console.log(`[confirm-enroll] Confirming SetupIntent ${setupIntentId}...`);
  const { customerId, paymentMethodId } = await facilitator.enrollCard(setupIntentId);
  console.log(`  → Customer: ${customerId}`);
  console.log(`  → PaymentMethod: ${paymentMethodId}`);
  console.log(`  ✓ Card enrolled successfully`);
  return paymentMethodId;
}
