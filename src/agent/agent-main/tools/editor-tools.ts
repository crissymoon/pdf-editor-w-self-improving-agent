import type { AgentToolDefinition, EditorCommandRunner } from '../../shared/types';

function buildTool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  runCommand: (argumentsMap: Record<string, unknown>) => ReturnType<EditorCommandRunner['run']>,
): AgentToolDefinition {
  return {
    name,
    description,
    inputSchema,
    execute: runCommand,
  };
}

export function createMainAgentTools(runner: EditorCommandRunner): AgentToolDefinition[] {
  return [
    buildTool(
      'editor.open_file_picker',
      'Open file picker to load a PDF document.',
      { type: 'object', properties: {} },
      () => runner.run({ command: 'open_file_picker' }),
    ),
    buildTool(
      'editor.open_merge_modal',
      'Open merge modal to combine multiple PDFs.',
      { type: 'object', properties: {} },
      () => runner.run({ command: 'open_merge_modal' }),
    ),
    buildTool(
      'editor.save_pdf',
      'Save the current PDF with annotations.',
      { type: 'object', properties: {} },
      () => runner.run({ command: 'save_pdf' }),
    ),
    buildTool(
      'editor.set_tool',
      'Switch active editing tool.',
      {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            enum: ['select', 'text', 'image', 'signature', 'highlight', 'checkbox', 'date'],
          },
        },
        required: ['tool'],
      },
      (argumentsMap) => runner.run({ command: 'set_tool', arguments: argumentsMap }),
    ),
    buildTool(
      'editor.canvas_click',
      'Apply currently selected tool at canvas coordinates.',
      {
        type: 'object',
        properties: {
          x: { type: 'number', minimum: 0 },
          y: { type: 'number', minimum: 0 },
        },
        required: ['x', 'y'],
      },
      (argumentsMap) => runner.run({ command: 'canvas_click', arguments: argumentsMap }),
    ),
    buildTool(
      'editor.zoom_in',
      'Increase zoom level.',
      { type: 'object', properties: {} },
      () => runner.run({ command: 'zoom_in' }),
    ),
    buildTool(
      'editor.zoom_out',
      'Decrease zoom level.',
      { type: 'object', properties: {} },
      () => runner.run({ command: 'zoom_out' }),
    ),
    buildTool(
      'editor.go_to_page',
      'Navigate to a page number.',
      {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
        },
        required: ['page'],
      },
      (argumentsMap) => runner.run({ command: 'go_to_page', arguments: argumentsMap }),
    ),
    buildTool(
      'editor.delete_selected_annotation',
      'Delete the currently selected annotation.',
      { type: 'object', properties: {} },
      () => runner.run({ command: 'delete_selected_annotation' }),
    ),
    buildTool(
      'editor.get_status',
      'Get current editor status summary.',
      { type: 'object', properties: {} },
      () => runner.run({ command: 'get_status' }),
    ),
  ];
}
