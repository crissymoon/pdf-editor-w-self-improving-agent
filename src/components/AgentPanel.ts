import type { DoubleAgentArchitecture } from '../agent';
import type { AgentToolCall, NarrationEvent } from '../agent';
import { agentChatSettings } from '../config/agent-chat-settings';

type ChatRole = 'user' | 'assistant' | 'system';

type MessageType = 'normal' | 'pending-approval' | 'cancelled';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
  agent: 'main' | 'dbl';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  messageType?: MessageType;
  pendingCall?: AgentToolCall;
}

const STORAGE_KEY = 'xcm_agent_chat_messages_v1';
const COLLAPSED_KEY = 'xcm_agent_chat_collapsed_v1';
const THEME_KEY = 'xcm_agent_chat_theme_v1';
const MAX_SAVED_MESSAGES = agentChatSettings.maxSavedMessages;
const CONTEXT_WINDOW = agentChatSettings.contextWindowMessages;

class AgentPanel {
  private panel: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private chatEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private statsEl: HTMLElement | null = null;
  private toggleEl: HTMLButtonElement | null = null;
  private fabEl: HTMLButtonElement | null = null;
  private themeToggleEl: HTMLButtonElement | null = null;
  private currentAgent: 'main' | 'dbl' = 'main';
  private messages: ChatMessage[] = [];
  private collapsed = false;
  private theme: 'dark' | 'light' = 'dark';
  private architecture: DoubleAgentArchitecture | null = null;

  init(architecture: DoubleAgentArchitecture): void {
    if (this.panel) {
      return;
    }
    this.architecture = architecture;

    this.panel = document.createElement('aside');
    this.panel.className = 'agent-panel';
    this.panel.innerHTML = `
      <div class="agent-panel-header">
        <div class="agent-panel-header-left">
          <div class="agent-panel-bot-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="3"/>
              <path d="M8 21h8M12 17v4"/>
              <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="15.5" cy="10" r="1.5" fill="currentColor" stroke="none"/>
              <path d="M9 14h6"/>
            </svg>
          </div>
          <div>
            <div class="agent-panel-title">AI Assistant</div>
            <div class="agent-panel-subtitle"><span class="agent-status-dot"></span> MCP Tool Chat</div>
          </div>
        </div>
        <div class="agent-panel-header-right">
          <button class="agent-icon-btn" id="agent-theme-toggle" type="button" aria-label="Toggle theme" title="Toggle light / dark">
            <svg class="agent-theme-icon-moon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            <svg class="agent-theme-icon-sun" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          </button>
          <button class="agent-icon-btn" id="agent-toggle" type="button" aria-label="Minimize" title="Minimize">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      <div class="agent-panel-body">
        <div class="agent-mode-bar">
          <span class="agent-mode-label">Mode</span>
          <select class="agent-mode-select" id="agent-select">
            <option value="main">main</option>
            <option value="dbl">dbl</option>
          </select>
          <span class="agent-stats" id="agent-stats"></span>
        </div>
        <div class="agent-chat" id="agent-chat"></div>
        <div class="agent-composer">
          <textarea class="agent-composer-textarea" id="agent-chat-input" placeholder="Ask AI to make changes to your PDF..." rows="2"></textarea>
          <button class="agent-composer-send" id="agent-send" type="button" title="Send (Enter)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>
        <div class="agent-toolbar">
          <button class="agent-toolbar-btn" id="agent-list-tools">List Tools</button>
          <button class="agent-toolbar-btn" id="agent-clear-chat">Clear</button>
          <span class="agent-hint-text">Shift+Enter for newline</span>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);

    const fab = document.createElement('button');
    fab.className = 'agent-panel-fab';
    fab.setAttribute('aria-label', 'Open agent chat');
    fab.title = 'Agent Chat';
    fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    document.body.appendChild(fab);
    this.fabEl = fab;

    fab.addEventListener('click', () => {
      this.setCollapsed(false);
      this.saveCollapsedState();
    });

    this.bodyEl = this.panel.querySelector('.agent-panel-body');
    this.chatEl = this.panel.querySelector('#agent-chat');
    this.inputEl = this.panel.querySelector('#agent-chat-input') as HTMLTextAreaElement;
    this.statsEl = this.panel.querySelector('#agent-stats');
    this.toggleEl = this.panel.querySelector('#agent-toggle') as HTMLButtonElement;
    this.themeToggleEl = this.panel.querySelector('#agent-theme-toggle') as HTMLButtonElement;

    const selectEl = this.panel.querySelector('#agent-select') as HTMLSelectElement;

    this.messages = this.loadMessages();
    this.renderMessages();
    this.setCollapsed(this.loadCollapsedState(), false);
    this.setTheme(this.loadTheme(), false);

    this.themeToggleEl?.addEventListener('click', () => {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
    });

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
        void this.sendChatMessage();
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
      void this.sendChatMessage();
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

    // Approval / cancel event delegation on the chat window
    this.chatEl?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const approveBtn = target.closest('[data-approve-id]') as HTMLElement | null;
      const cancelBtn = target.closest('[data-cancel-id]') as HTMLElement | null;
      if (approveBtn) {
        const msgId = approveBtn.dataset.approveId!;
        void this.executeApproved(msgId);
      } else if (cancelBtn) {
        const msgId = cancelBtn.dataset.cancelId!;
        this.cancelApproval(msgId);
      }
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

  private async sendChatMessage(): Promise<void> {
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
        text: 'Could not map that to a tool. Try: status, save pdf, zoom in, page 2, or /tool.name {"arg":"val"}.',
      });
      return;
    }

    // Show approval card — user must confirm before the tool runs
    this.appendApprovalCard(call);
  }

  private appendApprovalCard(call: AgentToolCall): void {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      agent: this.currentAgent,
      toolName: call.name,
      toolArgs: call.arguments,
      messageType: 'pending-approval',
      pendingCall: call,
    };
    this.messages.push(msg);
    if (this.messages.length > MAX_SAVED_MESSAGES) {
      this.messages = this.messages.slice(-MAX_SAVED_MESSAGES);
    }
    this.saveMessages();
    this.renderMessages();
  }

  private async executeApproved(msgId: string): Promise<void> {
    const msg = this.messages.find((m) => m.id === msgId);
    if (!msg?.pendingCall || !this.architecture) {
      return;
    }
    const call = msg.pendingCall;

    // Remove the approval card and show a running indicator
    const idx = this.messages.findIndex((m) => m.id === msgId);
    if (idx !== -1) {
      this.messages.splice(idx, 1);
    }
    this.appendMessage({ role: 'system', text: `Running: ${call.name}` });

    try {
      const result = await this.architecture[this.currentAgent].callTool(call);
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

  private cancelApproval(msgId: string): void {
    const msg = this.messages.find((m) => m.id === msgId);
    if (!msg) {
      return;
    }
    msg.messageType = 'cancelled';
    msg.pendingCall = undefined;
    this.saveMessages();
    this.renderMessages();
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
    const createMatch = lower.match(/(create|new)\s+(blank\s+)?pdf(?:\s+(?:with\s+)?)?(\d+)\s*(?:page|pages)?/);
    if (createMatch) {
      const pages = createMatch[3] ? Number(createMatch[3]) : 1;
      return { name: 'editor.create_blank_pdf', arguments: { pages: Math.max(1, pages || 1) } };
    }
    if ((lower.includes('create') || lower.includes('new')) && lower.includes('pdf')) {
      return { name: 'editor.create_blank_pdf', arguments: { pages: 1 } };
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
        if (entry.messageType === 'pending-approval' && entry.pendingCall) {
          return this.renderApprovalCard(entry);
        }
        if (entry.messageType === 'cancelled') {
          return this.renderCancelledCard(entry);
        }
        const roleLabel = entry.role === 'assistant' ? 'Agent' : entry.role === 'user' ? 'You' : 'System';
        const safeText = this.escapeHtml(entry.text);
        const toolTag = entry.toolName
          ? `<span class="agent-chat-tool-tag">${this.escapeHtml(entry.toolName)}</span>`
          : '';
        return `
          <div class="agent-chat-message agent-chat-message-${entry.role}">
            <div class="agent-chat-meta">${roleLabel}${toolTag}</div>
            <div class="agent-chat-bubble">${safeText}</div>
          </div>
        `;
      })
      .join('');

    this.chatEl.scrollTop = this.chatEl.scrollHeight;
    this.updateStats();
  }

  private renderApprovalCard(entry: ChatMessage): string {
    const call = entry.pendingCall!;
    const argsText =
      call.arguments && Object.keys(call.arguments).length > 0
        ? this.escapeHtml(JSON.stringify(call.arguments, null, 2))
        : 'No arguments';
    return `
      <div class="agent-chat-message agent-chat-message-approval">
        <div class="agent-approval-card">
          <div class="agent-approval-header">
            <svg class="agent-approval-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span class="agent-approval-tool">${this.escapeHtml(call.name)}</span>
            <span class="agent-approval-label">approval required</span>
          </div>
          <pre class="agent-approval-args">${argsText}</pre>
          <div class="agent-approval-actions">
            <button class="agent-approve-btn" data-approve-id="${entry.id}" type="button">Run</button>
            <button class="agent-cancel-btn" data-cancel-id="${entry.id}" type="button">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderCancelledCard(entry: ChatMessage): string {
    return `
      <div class="agent-chat-message agent-chat-message-system">
        <div class="agent-chat-bubble">Cancelled: ${this.escapeHtml(entry.toolName ?? 'tool')}</div>
      </div>
    `;
  }

  private updateStats(): void {
    if (!this.statsEl) {
      return;
    }
    this.statsEl.textContent = `context: ${CONTEXT_WINDOW} | stored: ${this.messages.length}/${MAX_SAVED_MESSAGES}`;
  }

  private setCollapsed(collapsed: boolean, animate = true): void {
    this.collapsed = collapsed;

    if (!animate || !this.panel) {
      // Immediate state — used on initial load to avoid playing animation on page open
      if (this.panel) {
        this.panel.classList.toggle('agent-panel-collapsed', collapsed);
      }
      if (this.bodyEl) {
        this.bodyEl.style.removeProperty('display');
      }
      if (this.fabEl) {
        this.fabEl.classList.toggle('agent-panel-fab-visible', collapsed);
      }
      return;
    }

    // Cancel any animation already in progress
    this.panel.classList.remove('agent-panel-genie-out', 'agent-panel-genie-in');
    void this.panel.offsetHeight; // Force reflow so animation restarts cleanly

    if (collapsed) {
      // Ensure panel is fully visible before we animate it away
      this.panel.classList.remove('agent-panel-collapsed');
      if (this.bodyEl) this.bodyEl.style.removeProperty('display');

      this.panel.classList.add('agent-panel-genie-out');
      this.panel.addEventListener(
        'animationend',
        () => {
          if (!this.collapsed) return; // Expand was triggered before animation finished
          this.panel?.classList.remove('agent-panel-genie-out');
          this.panel?.classList.add('agent-panel-collapsed');
          this.fabEl?.classList.add('agent-panel-fab-visible');
        },
        { once: true },
      );
    } else {
      // Hide FAB and reveal panel before playing expand animation
      this.fabEl?.classList.remove('agent-panel-fab-visible');
      this.panel.classList.remove('agent-panel-collapsed');
      if (this.bodyEl) this.bodyEl.style.removeProperty('display');

      this.panel.classList.add('agent-panel-genie-in');
      this.panel.addEventListener(
        'animationend',
        () => {
          this.panel?.classList.remove('agent-panel-genie-in');
        },
        { once: true },
      );
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

  private setTheme(theme: 'dark' | 'light', save = true): void {
    this.theme = theme;
    const isLight = theme === 'light';
    this.panel?.classList.toggle('agent-panel-light', isLight);
    this.fabEl?.classList.toggle('agent-panel-fab-light', isLight);
    // Swap icon visibility
    const moonIcon = this.themeToggleEl?.querySelector('.agent-theme-icon-moon') as HTMLElement | null;
    const sunIcon = this.themeToggleEl?.querySelector('.agent-theme-icon-sun') as HTMLElement | null;
    if (moonIcon) moonIcon.style.display = isLight ? 'none' : '';
    if (sunIcon) sunIcon.style.display = isLight ? '' : 'none';
    if (save) this.saveTheme();
  }

  private saveTheme(): void {
    try {
      localStorage.setItem(THEME_KEY, this.theme);
    } catch {
      // best-effort persistence only
    }
  }

  private loadTheme(): 'dark' | 'light' {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
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
