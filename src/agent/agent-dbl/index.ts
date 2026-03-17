import { MCPAgentCore } from '../shared/mcp-agent-core';
import { ReportStore } from '../shared/report-store';
import type { EditorCommandRunner } from '../shared/types';
import { createDblAgentTools } from './tools/editor-tools';

export function createAgentDbl(runner: EditorCommandRunner): MCPAgentCore {
  const reports = new ReportStore('dbl');
  const tools = createDblAgentTools(runner);
  return new MCPAgentCore('dbl', tools, reports);
}
