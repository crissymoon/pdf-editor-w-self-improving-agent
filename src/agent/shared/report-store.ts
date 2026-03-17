import type { AgentRole } from './types';

export interface AgentReportEntry {
  id: string;
  createdAt: number;
  category: 'tooling-needed' | 'error';
  title: string;
  details: string;
  toolName?: string;
}

const STORAGE_PREFIX = 'xcm-pdf-agent-reports';

export class ReportStore {
  constructor(private readonly agent: AgentRole) {}

  write(entry: Omit<AgentReportEntry, 'id' | 'createdAt'>): AgentReportEntry {
    const fullEntry: AgentReportEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    const current = this.readAll();
    current.push(fullEntry);
    localStorage.setItem(this.storageKey(), JSON.stringify(current));
    return fullEntry;
  }

  readAll(): AgentReportEntry[] {
    const raw = localStorage.getItem(this.storageKey());
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as AgentReportEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}:${this.agent}`;
  }
}
