export async function runMockModel(parser, prompt, context) {
  const started = Date.now();
  const seeded = hashText(`${context.requestId}|${prompt}`);

  // Deterministic latency lets smoke tests compare timing behavior across runs.
  const latencyMs = 20 + (seeded % 80);
  await sleep(latencyMs);

  const parsed = parser.parsePrompt(prompt, context);
  const tokenIn = estimateTokens(prompt);
  const tokenOut = parsed.success ? estimateTokens(JSON.stringify(parsed.action)) : 8;

  return {
    parsed,
    modelMeta: {
      latencyMs: Date.now() - started,
      confidence: parsed.success ? 0.91 : 0.12,
      tokenIn,
      tokenOut
    }
  };
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function hashText(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
