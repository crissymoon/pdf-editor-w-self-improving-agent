export async function initializeMcpSession(serverName: string): Promise<string> {
  return `connected:${serverName}`;
}

export async function callMcpTool(toolName: string, payload: unknown): Promise<string> {
  return JSON.stringify({ toolName, payload });
}

export const mcpHealth = {
  status: "unknown",
  latencyMs: 0
};
