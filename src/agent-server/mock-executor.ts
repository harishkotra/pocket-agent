export interface ExecutionResult {
  result: string;
  creditsUsed: number;
}

/**
 * Simulates AI task execution.
 * In production, this would call OpenAI / Anthropic / etc.
 */
export async function executeTask(
  agentId: string,
  prompt: string,
  maxCredits: number,
): Promise<ExecutionResult> {
  const elapsed = Math.floor(Math.random() * 500) + 100;
  await new Promise((r) => setTimeout(r, elapsed));

  const result = `[Mock AI] Agent "${agentId}" processed: "${prompt.slice(0, 80)}" (${elapsed}ms)`;
  return { result, creditsUsed: maxCredits };
}
