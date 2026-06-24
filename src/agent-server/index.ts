import 'dotenv/config';
import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { taskRoutes } from './routes/tasks.js';

const PORT = parseInt(process.env.AGENT_SERVER_PORT || '3010');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: false });

app.get('/health', async () => ({ status: 'ok', service: 'agent-server' }));

// Serve the demo UI
app.get('/', async (_req, reply) => {
  const html = fs.readFileSync(path.resolve(__dirname, 'public/index.html'), 'utf-8');
  return reply.type('text/html').send(html);
});

app.get('/api/config', async () => ({
  creditTokenAddress: process.env.CREDIT_TOKEN_ADDRESS || '',
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3020',
}));

// Mount x402-protected task routes
await taskRoutes(app);

const start = async () => {
  try {
    await app.listen({ port: PORT });
    console.log(`\n  [agent-server] Running on http://localhost:${PORT}`);
    console.log(`  [agent-server] UI: http://localhost:${PORT}`);
    console.log(`  [agent-server] Protected endpoint: POST /api/v1/agents/:id/tasks\n`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
