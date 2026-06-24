import 'dotenv/config';
import { Command } from 'commander';

const program = new Command();

program
  .name('pocket-agent')
  .description('Pocket money for your AI agents — Nevermined x402 delegation demo')
  .version('0.1.0');

program
  .command('enroll-card')
  .description('Phase 0: Enroll a Stripe test card as a payment method')
  .option('--card <number>', 'Test card number', '4242424242424242')
  .action(async (options) => {
    const { enrollCard } = await import('./cli/commands/enroll.js');
    await enrollCard(options.card);
  });

program
  .command('confirm-enroll')
  .description('Phase 0: Confirm card enrollment after VGS completion')
  .argument('<setupIntentId>', 'Stripe SetupIntent ID')
  .action(async (setupIntentId) => {
    const { confirmEnroll } = await import('./cli/commands/enroll.js');
    await confirmEnroll(setupIntentId);
  });

program
  .command('create-delegation')
  .description('Phase 1: Create a delegation')
  .requiredOption('--provider <type>', 'Provider type: stripe | erc4337')
  .option('--limit <cents>', 'Spending limit in cents', '10000')
  .option('--duration <secs>', 'Duration in seconds', '604800')
  .option('--currency <code>', 'Currency code', 'usd')
  .option('--subscriber <address>', 'Subscriber Ethereum address (defaults to FACILITATOR_ADDRESS)')
  .option('--customer <id>', 'Stripe customer ID (from enroll-card)')
  .option('--payment-method <id>', 'Stripe payment method ID (from enroll-card)')
  .action(async (options) => {
    const { createDelegation } = await import('./cli/commands/create-delegation.js');
    await createDelegation(options);
  });

program
  .command('invoke')
  .description('Phase 2-3: Invoke an AI agent with x402 payment')
  .requiredOption('--delegation <id>', 'Delegation ID to use')
  .requiredOption('--prompt <text>', 'Prompt for the agent')
  .option('--agent <id>', 'Agent ID', 'agent-1')
  .action(async (options) => {
    const { invoke } = await import('./cli/commands/invoke.js');
    await invoke(options);
  });

program
  .command('balance')
  .description('Check delegation balance and status')
  .requiredOption('--delegation <id>', 'Delegation ID')
  .action(async (options) => {
    const { checkBalance } = await import('./cli/commands/balance.js');
    await checkBalance(options.delegation);
  });

program
  .command('revoke')
  .description('Revoke a delegation')
  .requiredOption('--delegation <id>', 'Delegation ID to revoke')
  .action(async (options) => {
    const { revokeDelegation } = await import('./cli/commands/revoke.js');
    await revokeDelegation(options.delegation);
  });

program.parse(process.argv);
