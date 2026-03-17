import { createMainAgentTools } from '../../agent-main/tools/editor-tools';
import type { AgentToolDefinition, EditorCommandRunner } from '../../shared/types';

export function createDblAgentTools(runner: EditorCommandRunner): AgentToolDefinition[] {
  return createMainAgentTools(runner);
}
