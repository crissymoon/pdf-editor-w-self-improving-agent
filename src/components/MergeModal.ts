import { guardFile } from '../utils/file-guard';
import { icons } from '../utils/icons';
import { pdfService } from '../utils/pdf';
import { toast } from '../utils/toast';
import { setSanitizedHtml } from '../utils/safeHtml';
import type { MergeItem } from '../types';

export class MergeModal {
  private modal: HTMLElement | null = null;
  private files: MergeItem[] = [];
  private onMerge: ((data: ArrayBuffer) => void) | null = null;

  open(callback: (data: ArrayBuffer) => void): void {
    this.onMerge = callback;
    this.files = [];
    this.createModal();
  }

  private createModal(): void {
    this.modal = document.createElement('div');
    this.modal.className = 'modal-overlay';
    setSanitizedHtml(this.modal, `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Merge PDFs</h3>
          <button class="modal-close" id="merge-close">${icons.x}</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 16px; color: var(--color-gray-600); font-size: 14px;">
            Add PDF files to merge them into a single document. Drag to reorder.
          </p>

          <div class="drop-zone" id="merge-drop-zone">
            <div style="margin-bottom: 8px;">${icons.upload}</div>
            <div style="font-weight: 500; margin-bottom: 4px;">Drop PDF files here</div>
            <div style="font-size: 12px; color: var(--color-gray-500);">or click to browse</div>
            <input type="file" id="merge-file-input" class="hidden-input" multiple accept=".pdf">
          </div>

          <div class="file-list" id="merge-file-list" style="margin-top: 16px; display: none;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="merge-cancel">Cancel</button>
          <button class="btn btn-primary" id="merge-confirm" disabled>Merge PDFs</button>
        </div>
      </div>
    `);

    document.body.appendChild(this.modal);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.modal) return;

    const dropZone = this.modal.querySelector('#merge-drop-zone') as HTMLElement;
    const fileInput = this.modal.querySelector('#merge-file-input') as HTMLInputElement;

    this.modal.querySelector('#merge-close')?.addEventListener('click', () => this.close());
    this.modal.querySelector('#merge-cancel')?.addEventListener('click', () => this.close());
    this.modal.querySelector('#merge-confirm')?.addEventListener('click', () => this.merge());

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer?.files || []);
      void this.handleFiles(files);
    });

    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      void this.handleFiles(files);
      fileInput.value = '';
    });
  }

  private async handleFiles(files: File[]): Promise<void> {
    for (const file of files) {
      const guard = await guardFile(file);

      for (const v of guard.violations) {
        if (v.severity === 'block') {
          toast.error(`${file.name} rejected: ${v.message}`);
        } else {
          toast.warning(`${file.name}: ${v.message}`);
        }
      }

      if (!guard.ok) continue;

      const item: MergeItem = {
        id: crypto.randomUUID(),
        file,
        name: file.name,
      };
      this.files.push(item);
    }

    this.renderFileList();
    this.updateMergeButton();
  }

  private renderFileList(): void {
    const fileList = this.modal?.querySelector('#merge-file-list') as HTMLElement;
    if (!fileList) return;

    if (this.files.length === 0) {
      fileList.style.display = 'none';
      return;
    }

    fileList.style.display = 'block';
    setSanitizedHtml(fileList, this.files.map((item, index) => `
      <div class="file-item" data-id="${item.id}">
        <div class="file-item-info">
          <span class="file-item-icon">${icons.file}</span>
          <span class="file-item-name">${item.name}</span>
        </div>
        <div class="file-item-actions">
          <button class="btn btn-icon btn-toolbar" data-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>
            ${icons.arrowUp}
          </button>
          <button class="btn btn-icon btn-toolbar" data-action="down" data-index="${index}" ${index === this.files.length - 1 ? 'disabled' : ''}>
            ${icons.arrowDown}
          </button>
          <button class="btn btn-icon btn-toolbar" data-action="remove" data-id="${item.id}">
            ${icons.trash}
          </button>
        </div>
      </div>
    `).join(''));

    fileList.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;

        if (action === 'up') {
          const index = parseInt(target.dataset.index || '0');
          this.moveFile(index, index - 1);
        } else if (action === 'down') {
          const index = parseInt(target.dataset.index || '0');
          this.moveFile(index, index + 1);
        } else if (action === 'remove') {
          const id = target.dataset.id;
          this.removeFile(id!);
        }
      });
    });
  }

  private moveFile(fromIndex: number, toIndex: number): void {
    const item = this.files[fromIndex];
    this.files.splice(fromIndex, 1);
    this.files.splice(toIndex, 0, item);
    this.renderFileList();
  }

  private removeFile(id: string): void {
    this.files = this.files.filter(f => f.id !== id);
    this.renderFileList();
    this.updateMergeButton();
  }

  private updateMergeButton(): void {
    const mergeBtn = this.modal?.querySelector('#merge-confirm') as HTMLButtonElement;
    if (mergeBtn) {
      mergeBtn.disabled = this.files.length < 2;
    }
  }

  private async merge(): Promise<void> {
    if (this.files.length < 2) {
      toast.warning('Please add at least 2 PDF files to merge');
      return;
    }

    try {
      toast.info('Merging PDFs...');

      const pdfDataArray: ArrayBuffer[] = [];

      for (const item of this.files) {
        const buffer = await item.file.arrayBuffer();
        pdfDataArray.push(buffer);
      }

      const mergedPdf = await pdfService.mergePDFs(pdfDataArray);
      const buffer = mergedPdf.buffer as ArrayBuffer;

      toast.success('PDFs merged successfully');
      this.onMerge?.(buffer);
      this.close();
    } catch (error) {
      console.error('Merge error:', error);
      toast.error('Failed to merge PDFs');
    }
  }

  private close(): void {
    this.modal?.remove();
    this.modal = null;
    this.files = [];
    this.onMerge = null;
  }
}

export const mergeModal = new MergeModal();
