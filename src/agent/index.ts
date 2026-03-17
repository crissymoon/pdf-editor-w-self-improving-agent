import { createAgentDbl } from './agent-dbl';
import { createAgentMain } from './agent-main';
import type { MCPAgentCore } from './shared/mcp-agent-core';
import type { EditorCommandRunner } from './shared/types';

export interface DoubleAgentArchitecture {
  main: MCPAgentCore;
  dbl: MCPAgentCore;
}

export function createDoubleAgentArchitecture(runner: EditorCommandRunner): DoubleAgentArchitecture {
  return {
    main: createAgentMain(runner),
    dbl: createAgentDbl(runner),
  };
}

export type { AgentToolCall, NarrationEvent } from './shared/types';
