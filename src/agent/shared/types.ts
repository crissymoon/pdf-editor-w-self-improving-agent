export type AgentRole = 'main' | 'dbl';

export type EditorCommandName =
  | 'open_file_picker'
  | 'open_merge_modal'
  | 'save_pdf'
  | 'set_tool'
  | 'canvas_click'
  | 'zoom_in'
  | 'zoom_out'
  | 'go_to_page'
  | 'delete_selected_annotation'
  | 'get_status';

export interface EditorCommandRequest {
  command: EditorCommandName;
  arguments?: Record<string, unknown>;
}

export interface EditorCommandResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface EditorCommandRunner {
  run(request: EditorCommandRequest): Promise<EditorCommandResult>;
}

export interface NarrationEvent {
  timestamp: number;
  agent: AgentRole;
  message: string;
  phase: 'start' | 'progress' | 'complete' | 'error';
}

export interface AgentToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<EditorCommandResult>;
}

export interface MCPToolListResult {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}

export interface MCPToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  metadata: {
    tool: string;
    agent: AgentRole;
    ok: boolean;
  };
}
