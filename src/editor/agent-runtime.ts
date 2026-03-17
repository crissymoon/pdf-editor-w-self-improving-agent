import { createDoubleAgentArchitecture } from '../agent';
import type { AgentToolCall } from '../agent';
import type { EditorCommandRequest, EditorCommandResult } from '../agent/shared/types';
import { agentPanel } from '../components/AgentPanel';
import { pdfService } from '../utils/pdf';
import { toast } from '../utils/toast';

interface SetupAgentRuntimeOptions {
  runEditorCommand: (request: EditorCommandRequest) => Promise<EditorCommandResult>;
}

interface RunEditorCommandHandlers {
  openFilePicker: () => void;
  openMergeModal: () => void;
  loadPDF: (data: ArrayBuffer, filename: string) => Promise<void>;
  savePDF: () => Promise<void>;
  emailCurrentPDF: (input: { to: string; subject?: string; body?: string }) => Promise<EditorCommandResult>;
  isSupportedTool: (tool: string) => boolean;
  setActiveTool: (tool: string | null) => void;
  applyActiveToolAt: (x: number, y: number) => boolean;
  getActiveTool: () => string | null;
  zoomIn: () => void;
  zoomOut: () => void;
  goToPage: (page: number) => Promise<void>;
  deleteSelectedAnnotation: () => void;
  getAnnotationsCount: () => number;
  getStatus: () => { currentPage: number; totalPages: number; zoom: number; activeTool: string | null; pdfLoaded: boolean };
}

export function setupAgentRuntime(options: SetupAgentRuntimeOptions): void {
  const architecture = createDoubleAgentArchitecture({
    run: (request) => options.runEditorCommand(request),
  });

  architecture.main.subscribeNarration((event) => {
    toast.info(`[agent-main ${event.phase}] ${event.message}`);
  });

  architecture.dbl.subscribeNarration((event) => {
    toast.info(`[agent-dbl ${event.phase}] ${event.message}`);
  });

  const globalWindow = window as Window & {
    xcmPdfAgents?: {
      listTools: (agent: 'main' | 'dbl') => ReturnType<typeof architecture.main.listTools>;
      callTool: (agent: 'main' | 'dbl', call: AgentToolCall) => ReturnType<typeof architecture.main.callTool>;
      getReports: (agent: 'main' | 'dbl') => ReturnType<typeof architecture.main.getReports>;
    };
  };

  globalWindow.xcmPdfAgents = {
    listTools: (agent) => architecture[agent].listTools(),
    callTool: (agent, call) => architecture[agent].callTool(call),
    getReports: (agent) => architecture[agent].getReports(),
  };

  agentPanel.init(architecture);
}

export async function runEditorCommand(
  request: EditorCommandRequest,
  handlers: RunEditorCommandHandlers,
): Promise<EditorCommandResult> {
  switch (request.command) {
    case 'open_file_picker':
      handlers.openFilePicker();
      return { ok: true, message: 'File picker opened' };
    case 'open_merge_modal':
      handlers.openMergeModal();
      return { ok: true, message: 'Merge modal opened' };
    case 'create_blank_pdf': {
      const pagesRaw = Number(request.arguments?.pages ?? 1);
      const pages = Number.isFinite(pagesRaw) ? Math.max(1, Math.floor(pagesRaw)) : 1;
      const createdBytes = await pdfService.createBlankPDF(pages);
      const buffer = Uint8Array.from(createdBytes).buffer as ArrayBuffer;
      const fileLabel = pages === 1 ? 'blank-1-page.pdf' : `blank-${pages}-pages.pdf`;
      await handlers.loadPDF(buffer, fileLabel);
      return { ok: true, message: `Created blank PDF with ${pages} page(s)` };
    }
    case 'save_pdf':
      await handlers.savePDF();
      return { ok: true, message: 'Save command executed' };
    case 'email_pdf': {
      const to = String(request.arguments?.to ?? '').trim();
      const subject = String(request.arguments?.subject ?? '').trim();
      const body = String(request.arguments?.body ?? '').trim();
      return handlers.emailCurrentPDF({ to, subject, body });
    }
    case 'set_tool': {
      const tool = String(request.arguments?.tool ?? '').trim();
      if (!handlers.isSupportedTool(tool)) {
        return { ok: false, message: `Unsupported tool: ${tool || 'empty'}` };
      }
      handlers.setActiveTool(tool);
      return { ok: true, message: `Active tool set to ${tool}` };
    }
    case 'canvas_click': {
      const x = Number(request.arguments?.x ?? Number.NaN);
      const y = Number(request.arguments?.y ?? Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
        return { ok: false, message: 'x and y must be non-negative numbers' };
      }
      const applied = handlers.applyActiveToolAt(x, y);
      return {
        ok: applied,
        message: applied ? `Applied ${handlers.getActiveTool() || 'tool'} at x=${x}, y=${y}` : 'No applicable active tool selected',
      };
    }
    case 'zoom_in':
      handlers.zoomIn();
      return { ok: true, message: 'Zoom in executed' };
    case 'zoom_out':
      handlers.zoomOut();
      return { ok: true, message: 'Zoom out executed' };
    case 'go_to_page': {
      const pageValue = Number(request.arguments?.page ?? 0);
      if (!Number.isInteger(pageValue) || pageValue < 1) {
        return { ok: false, message: 'Page must be an integer greater than 0' };
      }
      await handlers.goToPage(pageValue);
      return { ok: true, message: `Navigated to page ${pageValue}` };
    }
    case 'delete_selected_annotation': {
      const before = handlers.getAnnotationsCount();
      handlers.deleteSelectedAnnotation();
      const deleted = handlers.getAnnotationsCount() < before;
      return {
        ok: deleted,
        message: deleted ? 'Selected annotation deleted' : 'No selected annotation to delete',
      };
    }
    case 'get_status': {
      const status = handlers.getStatus();
      return {
        ok: true,
        message: 'Editor status collected',
        data: {
          currentPage: status.currentPage,
          totalPages: status.totalPages,
          zoom: status.zoom,
          annotations: handlers.getAnnotationsCount(),
          activeTool: status.activeTool,
          pdfLoaded: status.pdfLoaded,
        },
      };
    }
    default:
      return { ok: false, message: `Unsupported command: ${request.command}` };
  }
}