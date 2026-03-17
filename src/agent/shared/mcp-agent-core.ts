import { ReportStore } from './report-store';
import type {
  AgentRole,
  AgentToolCall,
  AgentToolDefinition,
  EditorCommandResult,
  MCPToolCallResult,
  MCPToolListResult,
  NarrationEvent,
} from './types';

export class MCPAgentCore {
  private readonly subscribers = new Set<(event: NarrationEvent) => void>();

  constructor(
    private readonly role: AgentRole,
    private readonly tools: AgentToolDefinition[],
    private readonly reports: ReportStore,
  ) {}

  subscribeNarration(handler: (event: NarrationEvent) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  listTools(): MCPToolListResult {
    return {
      tools: this.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  }

  async callTool(call: AgentToolCall): Promise<MCPToolCallResult> {
    this.emit('start', `Starting tool ${call.name}`);

    const tool = this.tools.find((item) => item.name === call.name);
    if (!tool) {
      const details = `Tool ${call.name} is not currently implemented in agent ${this.role}`;
      this.reports.write({
        category: 'tooling-needed',
        title: 'Missing tool implementation',
        details,
        toolName: call.name,
      });
      this.emit('error', details);
      return {
        content: [{ type: 'text', text: details }],
        metadata: { tool: call.name, agent: this.role, ok: false },
      };
    }

    try {
      this.emit('progress', `Running tool ${call.name}`);
      const result = await tool.execute(call.arguments ?? {});
      this.emit(result.ok ? 'complete' : 'error', result.message);
      return this.toMCPResult(call.name, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool error';
      this.reports.write({
        category: 'error',
        title: `Tool ${call.name} failed`,
        details: message,
        toolName: call.name,
      });
      this.emit('error', `Tool ${call.name} failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Tool ${call.name} failed: ${message}` }],
        metadata: { tool: call.name, agent: this.role, ok: false },
      };
    }
  }

  getReports() {
    return this.reports.readAll();
  }

  private toMCPResult(tool: string, result: EditorCommandResult): MCPToolCallResult {
    const payload = {
      ok: result.ok,
      message: result.message,
      data: result.data ?? {},
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      metadata: {
        tool,
        agent: this.role,
        ok: result.ok,
      },
    };
  }

  private emit(phase: NarrationEvent['phase'], message: string): void {
    const event: NarrationEvent = {
      timestamp: Date.now(),
      agent: this.role,
      phase,
      message,
    };

    this.subscribers.forEach((handler) => {
      handler(event);
    });
  }
}
