import { MCPAgentCore } from '../shared/mcp-agent-core';
import { ReportStore } from '../shared/report-store';
import type { EditorCommandRunner } from '../shared/types';
import { createMainAgentTools } from './tools/editor-tools';

export function createAgentMain(runner: EditorCommandRunner): MCPAgentCore {
  const reports = new ReportStore('main');
  const tools = createMainAgentTools(runner);
  return new MCPAgentCore('main', tools, reports);
}
