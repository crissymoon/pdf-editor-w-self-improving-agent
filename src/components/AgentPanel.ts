import type { DoubleAgentArchitecture } from '../agent';
import type { AgentToolCall, NarrationEvent } from '../agent';

class AgentPanel {
  private panel: HTMLElement | null = null;
  private logsEl: HTMLElement | null = null;
  private reportsEl: HTMLElement | null = null;
  private currentAgent: 'main' | 'dbl' = 'main';
  private selectedTool = 'editor.get_status';

  init(architecture: DoubleAgentArchitecture): void {
    if (this.panel) {
      return;
    }

    this.panel = document.createElement('aside');
    this.panel.className = 'agent-panel';
    this.panel.innerHTML = `
      <div class="agent-panel-header">
        <div class="agent-panel-title">Agent Control</div>
        <div class="agent-panel-subtitle">MCP tool runner</div>
      </div>
      <div class="agent-panel-body">
        <label class="agent-label" for="agent-select">Agent</label>
        <select class="agent-input" id="agent-select">
          <option value="main">main</option>
          <option value="dbl">dbl</option>
        </select>

        <label class="agent-label" for="agent-tool">Tool</label>
        <input class="agent-input" id="agent-tool" value="editor.get_status" />

        <label class="agent-label" for="agent-args">Arguments JSON</label>
        <textarea class="agent-input agent-textarea" id="agent-args">{}</textarea>

        <div class="agent-actions">
          <button class="btn btn-secondary" id="agent-list-tools">List Tools</button>
          <button class="btn btn-primary" id="agent-run-tool">Run Tool</button>
          <button class="btn btn-secondary" id="agent-load-reports">Load Reports</button>
        </div>

        <div class="agent-section-title">Narration Stream</div>
        <pre class="agent-stream" id="agent-stream"></pre>

        <div class="agent-section-title">Reports</div>
        <pre class="agent-stream" id="agent-reports"></pre>
      </div>
    `;

    document.body.appendChild(this.panel);

    this.logsEl = this.panel.querySelector('#agent-stream');
    this.reportsEl = this.panel.querySelector('#agent-reports');

    const selectEl = this.panel.querySelector('#agent-select') as HTMLSelectElement;
    const toolEl = this.panel.querySelector('#agent-tool') as HTMLInputElement;
    const argsEl = this.panel.querySelector('#agent-args') as HTMLTextAreaElement;

    selectEl.addEventListener('change', () => {
      this.currentAgent = selectEl.value === 'dbl' ? 'dbl' : 'main';
      this.log(`Switched to agent ${this.currentAgent}`);
    });

    toolEl.addEventListener('input', () => {
      this.selectedTool = toolEl.value.trim();
    });

    this.panel.querySelector('#agent-list-tools')?.addEventListener('click', () => {
      const result = architecture[this.currentAgent].listTools();
      this.log(JSON.stringify(result, null, 2));
    });

    this.panel.querySelector('#agent-run-tool')?.addEventListener('click', async () => {
      const call = this.parseCall(this.selectedTool, argsEl.value);
      if (!call) {
        return;
      }
      const result = await architecture[this.currentAgent].callTool(call);
      this.log(JSON.stringify(result, null, 2));
    });

    this.panel.querySelector('#agent-load-reports')?.addEventListener('click', () => {
      const reports = architecture[this.currentAgent].getReports();
      if (this.reportsEl) {
        this.reportsEl.textContent = JSON.stringify(reports, null, 2);
      }
    });

    architecture.main.subscribeNarration((event) => {
      this.onNarration(event);
    });

    architecture.dbl.subscribeNarration((event) => {
      this.onNarration(event);
    });

    this.log('Agent panel initialized');
  }

  private parseCall(name: string, argsRaw: string): AgentToolCall | null {
    if (!name) {
      this.log('Tool name is required');
      return null;
    }

    try {
      const parsed = JSON.parse(argsRaw || '{}') as Record<string, unknown>;
      return {
        name,
        arguments: parsed,
      };
    } catch {
      this.log('Arguments JSON is invalid');
      return null;
    }
  }

  private onNarration(event: NarrationEvent): void {
    const line = `${new Date(event.timestamp).toLocaleTimeString()} [${event.agent}] ${event.phase}: ${event.message}`;
    this.log(line);
  }

  private log(message: string): void {
    if (!this.logsEl) {
      return;
    }
    const current = this.logsEl.textContent ?? '';
    const next = current.length > 0 ? `${current}\n${message}` : message;
    this.logsEl.textContent = next;
    this.logsEl.scrollTop = this.logsEl.scrollHeight;
  }
}

export const agentPanel = new AgentPanel();
