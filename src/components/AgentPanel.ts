import type { DoubleAgentArchitecture } from '../agent';
import type { AgentToolCall, NarrationEvent } from '../agent';
import { agentChatSettings } from '../config/agent-chat-settings';

type ChatRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
  agent: 'main' | 'dbl';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

const STORAGE_KEY = 'xcm_agent_chat_messages_v1';
const COLLAPSED_KEY = 'xcm_agent_chat_collapsed_v1';
const MAX_SAVED_MESSAGES = agentChatSettings.maxSavedMessages;
const CONTEXT_WINDOW = agentChatSettings.contextWindowMessages;

class AgentPanel {
  private panel: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private chatEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private statsEl: HTMLElement | null = null;
  private toggleEl: HTMLButtonElement | null = null;
  private currentAgent: 'main' | 'dbl' = 'main';
  private messages: ChatMessage[] = [];
  private collapsed = false;

  init(architecture: DoubleAgentArchitecture): void {
    if (this.panel) {
      return;
    }

    this.panel = document.createElement('aside');
    this.panel.className = 'agent-panel';
    this.panel.innerHTML = `
      <div class="agent-panel-header">
        <div class="agent-panel-title-row">
          <div class="agent-panel-title">Agent Chat</div>
          <button class="agent-toggle" id="agent-toggle" type="button" aria-label="Minimize agent chat" title="Minimize">_</button>
        </div>
        <div class="agent-panel-subtitle">
          <span>Simple MCP tool chat</span>
          <span class="agent-stats" id="agent-stats"></span>
        </div>
      </div>
      <div class="agent-panel-body">
        <label class="agent-label" for="agent-select">Agent</label>
        <select class="agent-input" id="agent-select">
          <option value="main">main</option>
          <option value="dbl">dbl</option>
        </select>

        <div class="agent-chat" id="agent-chat"></div>

        <label class="agent-label" for="agent-chat-input">Message</label>
        <textarea class="agent-input agent-textarea" id="agent-chat-input" placeholder="Try: status, save pdf, zoom in, page 2, /editor.set_tool {\"tool\":\"text\"}"></textarea>

        <div class="agent-actions">
          <button class="btn btn-primary" id="agent-send">Send</button>
          <button class="btn btn-secondary" id="agent-list-tools">List Tools</button>
          <button class="btn btn-secondary" id="agent-clear-chat">Clear</button>
        </div>

        <div class="agent-hint">History keeps last ${MAX_SAVED_MESSAGES} messages. Only last ${CONTEXT_WINDOW} are used as context for the next message.</div>
      </div>
    `;

    document.body.appendChild(this.panel);

    this.bodyEl = this.panel.querySelector('.agent-panel-body');
    this.chatEl = this.panel.querySelector('#agent-chat');
    this.inputEl = this.panel.querySelector('#agent-chat-input') as HTMLTextAreaElement;
    this.statsEl = this.panel.querySelector('#agent-stats');
    this.toggleEl = this.panel.querySelector('#agent-toggle') as HTMLButtonElement;

    const selectEl = this.panel.querySelector('#agent-select') as HTMLSelectElement;

    this.messages = this.loadMessages();
    this.renderMessages();
    this.setCollapsed(this.loadCollapsedState());

    this.toggleEl?.addEventListener('click', () => {
      this.setCollapsed(!this.collapsed);
      this.saveCollapsedState();
    });

    selectEl.addEventListener('change', () => {
      this.currentAgent = selectEl.value === 'dbl' ? 'dbl' : 'main';
      this.appendMessage({
        role: 'system',
        text: `Switched to agent ${this.currentAgent}`,
      });
    });

    this.inputEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.sendChatMessage(architecture);
      }
    });

    this.panel.querySelector('#agent-list-tools')?.addEventListener('click', () => {
      const result = architecture[this.currentAgent].listTools();
      const toolNames = result.tools.map((tool) => tool.name).join(', ');
      this.appendMessage({
        role: 'assistant',
        text: `Available tools: ${toolNames}`,
      });
    });

    this.panel.querySelector('#agent-send')?.addEventListener('click', () => {
      void this.sendChatMessage(architecture);
    });

    this.panel.querySelector('#agent-clear-chat')?.addEventListener('click', () => {
      this.messages = [];
      this.saveMessages();
      this.renderMessages();
      this.appendMessage({
        role: 'system',
        text: 'Chat history cleared',
      });
    });

    architecture.main.subscribeNarration((event) => {
      this.onNarration(event);
    });

    architecture.dbl.subscribeNarration((event) => {
      this.onNarration(event);
    });

    this.appendMessage({
      role: 'system',
      text: 'Agent chat initialized',
    });
  }

  private async sendChatMessage(architecture: DoubleAgentArchitecture): Promise<void> {
    const raw = (this.inputEl?.value ?? '').trim();
    if (!raw) {
      return;
    }

    this.inputEl!.value = '';
    this.appendMessage({ role: 'user', text: raw });

    const context = this.getContextMessages(CONTEXT_WINDOW);
    const call = this.resolveCallFromMessage(raw, context);

    if (!call) {
      this.appendMessage({
        role: 'assistant',
        text: 'Could not map that message to a tool. Try: status, save pdf, zoom in, page 2, or /editor.set_tool {"tool":"text"}.',
      });
      return;
    }

    try {
      const result = await architecture[this.currentAgent].callTool(call);
      const output = result.content.map((item) => item.text).join('\n');
      this.appendMessage({
        role: 'assistant',
        text: output,
        toolName: call.name,
        toolArgs: call.arguments,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool error';
      this.appendMessage({
        role: 'assistant',
        text: `Tool execution failed: ${message}`,
      });
    }
  }

  private resolveCallFromMessage(raw: string, context: ChatMessage[]): AgentToolCall | null {
    const message = raw.trim();
    const lower = message.toLowerCase();

    // Explicit tool call syntax: /tool.name {"arg":"value"}
    if (message.startsWith('/')) {
      const firstSpace = message.indexOf(' ');
      const name = (firstSpace === -1 ? message.slice(1) : message.slice(1, firstSpace)).trim();
      const argsRaw = firstSpace === -1 ? '{}' : message.slice(firstSpace + 1).trim();
      try {
        const parsed = JSON.parse(argsRaw || '{}') as Record<string, unknown>;
        return { name, arguments: parsed };
      } catch {
        return null;
      }
    }

    const pageMatch = lower.match(/page\s+(\d+)/);
    if (pageMatch) {
      return {
        name: 'editor.go_to_page',
        arguments: { page: Number(pageMatch[1]) },
      };
    }

    const toolMatch = lower.match(/(set|use|switch)\s+(tool\s+)?(select|text|image|signature|highlight|checkbox|date)/);
    if (toolMatch) {
      return {
        name: 'editor.set_tool',
        arguments: { tool: toolMatch[3] },
      };
    }

    if (lower.includes('open') && lower.includes('merge')) {
      return { name: 'editor.open_merge_modal', arguments: {} };
    }
    if (lower.includes('open') && (lower.includes('file') || lower.includes('pdf'))) {
      return { name: 'editor.open_file_picker', arguments: {} };
    }
    if (lower.includes('save')) {
      return { name: 'editor.save_pdf', arguments: {} };
    }
    if (lower.includes('zoom in')) {
      return { name: 'editor.zoom_in', arguments: {} };
    }
    if (lower.includes('zoom out')) {
      return { name: 'editor.zoom_out', arguments: {} };
    }
    if (lower.includes('delete')) {
      return { name: 'editor.delete_selected_annotation', arguments: {} };
    }
    if (lower.includes('status')) {
      return { name: 'editor.get_status', arguments: {} };
    }

    if (/(again|repeat|same)/.test(lower)) {
      const previousTool = [...context].reverse().find((entry) => entry.toolName);
      if (previousTool?.toolName) {
        return {
          name: previousTool.toolName,
          arguments: previousTool.toolArgs ?? {},
        };
      }
    }

    return null;
  }

  private onNarration(event: NarrationEvent): void {
    if (event.phase !== 'error') {
      return;
    }
    const line = `[${event.agent}] ${event.phase}: ${event.message}`;
    this.appendMessage({ role: 'system', text: line, agent: event.agent });
  }

  private appendMessage(input: {
    role: ChatRole;
    text: string;
    agent?: 'main' | 'dbl';
    toolName?: string;
    toolArgs?: Record<string, unknown>;
  }): void {
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: input.role,
      text: input.text,
      timestamp: Date.now(),
      agent: input.agent ?? this.currentAgent,
      toolName: input.toolName,
      toolArgs: input.toolArgs,
    };

    this.messages.push(message);
    if (this.messages.length > MAX_SAVED_MESSAGES) {
      this.messages = this.messages.slice(-MAX_SAVED_MESSAGES);
    }

    this.saveMessages();
    this.renderMessages();
  }

  private getContextMessages(limit: number): ChatMessage[] {
    const withoutCurrentSystemNoise = this.messages.filter((entry) => entry.role !== 'system');
    return withoutCurrentSystemNoise.slice(-limit);
  }

  private renderMessages(): void {
    if (!this.chatEl) {
      return;
    }

    this.chatEl.innerHTML = this.messages
      .map((entry) => {
        const roleLabel = entry.role === 'assistant' ? 'Agent' : entry.role === 'user' ? 'You' : 'System';
        const safeText = this.escapeHtml(entry.text);
        return `
          <div class="agent-chat-message agent-chat-message-${entry.role}">
            <div class="agent-chat-meta">${roleLabel} · ${entry.agent}</div>
            <div class="agent-chat-bubble">${safeText}</div>
          </div>
        `;
      })
      .join('');

    this.chatEl.scrollTop = this.chatEl.scrollHeight;
    this.updateStats();
  }

  private updateStats(): void {
    if (!this.statsEl) {
      return;
    }
    this.statsEl.textContent = `context: ${CONTEXT_WINDOW} | stored: ${this.messages.length}/${MAX_SAVED_MESSAGES}`;
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    if (this.panel) {
      this.panel.classList.toggle('agent-panel-collapsed', collapsed);
    }
    if (this.bodyEl) {
      this.bodyEl.style.display = collapsed ? 'none' : 'flex';
    }
    if (this.toggleEl) {
      this.toggleEl.textContent = collapsed ? '+' : '_';
      this.toggleEl.setAttribute('aria-label', collapsed ? 'Expand agent chat' : 'Minimize agent chat');
      this.toggleEl.title = collapsed ? 'Expand' : 'Minimize';
    }
  }

  private saveCollapsedState(): void {
    try {
      localStorage.setItem(COLLAPSED_KEY, this.collapsed ? '1' : '0');
    } catch {
      // best-effort persistence only
    }
  }

  private loadCollapsedState(): boolean {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private saveMessages(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages.slice(-MAX_SAVED_MESSAGES)));
    } catch {
      // best-effort persistence only
    }
  }

  private loadMessages(): ChatMessage[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.slice(-MAX_SAVED_MESSAGES);
    } catch {
      return [];
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br />');
  }
}

export const agentPanel = new AgentPanel();
