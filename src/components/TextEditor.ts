import { icons } from '../utils/icons';
import { setSanitizedHtml } from '../utils/safeHtml';

export interface TextOptions {
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
}

export class TextEditor {
  private modal: HTMLElement | null = null;
  private onSave: ((options: TextOptions) => void) | null = null;
  private initialText: string = '';

  open(callback: (options: TextOptions) => void, initialText: string = ''): void {
    this.onSave = callback;
    this.initialText = initialText;
    this.createModal();
  }

  private createModal(): void {
    this.modal = document.createElement('div');
    this.modal.className = 'modal-overlay';
    setSanitizedHtml(this.modal, `
      <div class="modal" style="max-width: 500px;">
        <div class="modal-header">
          <h3 class="modal-title">Add Text</h3>
          <button class="modal-close" id="text-close">${icons.x}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Text</label>
            <textarea class="form-input" id="text-content" rows="4" placeholder="Enter your text here...">${this.initialText}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Font Size</label>
            <select class="form-select" id="text-font-size">
              <option value="10">10px</option>
              <option value="12">12px</option>
              <option value="14" selected>14px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
              <option value="20">20px</option>
              <option value="24">24px</option>
              <option value="28">28px</option>
              <option value="32">32px</option>
              <option value="36">36px</option>
              <option value="48">48px</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Font Family</label>
            <select class="form-select" id="text-font-family">
              <option value="Helvetica">Helvetica</option>
              <option value="Times-Roman">Times Roman</option>
              <option value="Courier">Courier</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Color</label>
            <div class="color-picker" id="text-color-picker">
              <div class="color-option active" data-color="#000000" style="background-color: #000000;"></div>
              <div class="color-option" data-color="#1f2937" style="background-color: #1f2937;"></div>
              <div class="color-option" data-color="#374151" style="background-color: #374151;"></div>
              <div class="color-option" data-color="#6b7280" style="background-color: #6b7280;"></div>
              <div class="color-option" data-color="#7c3aed" style="background-color: #7c3aed;"></div>
              <div class="color-option" data-color="#2563eb" style="background-color: #2563eb;"></div>
              <div class="color-option" data-color="#059669" style="background-color: #059669;"></div>
              <div class="color-option" data-color="#dc2626" style="background-color: #dc2626;"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="text-cancel">Cancel</button>
          <button class="btn btn-primary" id="text-save">Add Text</button>
        </div>
      </div>
    `);

    document.body.appendChild(this.modal);
    this.setupEventListeners();

    const textarea = this.modal.querySelector('#text-content') as HTMLTextAreaElement;
    textarea.focus();
  }

  private setupEventListeners(): void {
    if (!this.modal) return;

    this.modal.querySelector('#text-close')?.addEventListener('click', () => this.close());
    this.modal.querySelector('#text-cancel')?.addEventListener('click', () => this.close());
    this.modal.querySelector('#text-save')?.addEventListener('click', () => this.save());

    const colorPicker = this.modal.querySelector('#text-color-picker');
    colorPicker?.querySelectorAll('.color-option').forEach(option => {
      option.addEventListener('click', () => {
        colorPicker.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
        option.classList.add('active');
      });
    });
  }

  private save(): void {
    const textContent = (this.modal?.querySelector('#text-content') as HTMLTextAreaElement)?.value;
    const fontSize = parseInt((this.modal?.querySelector('#text-font-size') as HTMLSelectElement)?.value);
    const fontFamily = (this.modal?.querySelector('#text-font-family') as HTMLSelectElement)?.value;
    const color = this.modal?.querySelector('.color-option.active')?.getAttribute('data-color') || '#000000';

    if (!textContent.trim()) {
      this.close();
      return;
    }

    this.onSave?.({
      text: textContent,
      fontSize,
      color,
      fontFamily,
    });

    this.close();
  }

  private close(): void {
    this.modal?.remove();
    this.modal = null;
    this.onSave = null;
  }
}

export const textEditor = new TextEditor();
