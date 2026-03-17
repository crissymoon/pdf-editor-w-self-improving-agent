import { icons } from '../utils/icons';
import { cryptoService } from '../utils/crypto';
import { toast } from '../utils/toast';
import { setSanitizedHtml } from '../utils/safeHtml';
import type { SignatureData, CryptoSignature } from '../types';

export class SignaturePad {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
  private modal: HTMLElement | null = null;
  private onSave: ((signature: SignatureData) => void) | null = null;
  private useCryptoSign = false;

  open(callback: (signature: SignatureData) => void): void {
    this.onSave = callback;
    this.createModal();
    this.setupCanvas();
  }

  private createModal(): void {
    this.modal = document.createElement('div');
    this.modal.className = 'modal-overlay';
    setSanitizedHtml(this.modal, `
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h3 class="modal-title">Create Signature</h3>
          <button class="modal-close" id="sig-close">${icons.x}</button>
        </div>
        <div class="modal-body">
          <div class="tabs">
            <div class="tab active" data-tab="draw">Draw</div>
            <div class="tab" data-tab="type">Type</div>
          </div>

          <div id="draw-tab">
            <div class="signature-pad-container">
              <canvas id="signature-canvas" class="signature-pad"></canvas>
            </div>
            <div class="signature-actions">
              <button class="btn btn-toolbar" id="sig-clear">${icons.clear} Clear</button>
            </div>
          </div>

          <div id="type-tab" style="display: none;">
            <div class="form-group">
              <label class="form-label">Type your signature</label>
              <input type="text" class="form-input" id="typed-signature" placeholder="Your Name">
            </div>
            <div class="form-group">
              <label class="form-label">Font Style</label>
              <select class="form-select" id="sig-font">
                <option value="'Brush Script MT', cursive">Brush Script</option>
                <option value="'Lucida Handwriting', cursive">Lucida Handwriting</option>
                <option value="'Segoe Script', cursive">Segoe Script</option>
                <option value="Georgia, serif">Georgia</option>
              </select>
            </div>
            <div class="signature-pad-container" style="display: flex; align-items: center; justify-content: center; height: 100px;">
              <span id="typed-preview" style="font-size: 32px; font-family: 'Brush Script MT', cursive;"></span>
            </div>
          </div>

          <div class="form-group" style="margin-top: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="crypto-sign-checkbox">
              <span>${icons.shieldCheck}</span>
              <span>Apply cryptographic signature (tamper-proof)</span>
            </label>
          </div>

          <div id="crypto-info" class="crypto-info" style="display: none;">
            <div class="crypto-info-title">Cryptographic Signature</div>
            <div class="crypto-info-item">Algorithm: RSA-PSS with SHA-256</div>
            <div class="crypto-info-item" id="key-fingerprint">Key fingerprint: Generating...</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="sig-cancel">Cancel</button>
          <button class="btn btn-primary" id="sig-save">Insert Signature</button>
        </div>
      </div>
    `);

    document.body.appendChild(this.modal);
    this.setupEventListeners();
  }

  private setupCanvas(): void {
    this.canvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;

    const container = this.canvas.parentElement!;
    this.canvas.width = container.clientWidth - 2;
    this.canvas.height = 200;

    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
  }

  private setupEventListeners(): void {
    if (!this.modal) return;

    this.modal.querySelector('#sig-close')?.addEventListener('click', () => this.close());
    this.modal.querySelector('#sig-cancel')?.addEventListener('click', () => this.close());
    this.modal.querySelector('#sig-clear')?.addEventListener('click', () => this.clear());
    this.modal.querySelector('#sig-save')?.addEventListener('click', () => this.save());

    const tabs = this.modal.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabName = tab.getAttribute('data-tab');
        const drawTab = this.modal!.querySelector('#draw-tab') as HTMLElement;
        const typeTab = this.modal!.querySelector('#type-tab') as HTMLElement;

        if (tabName === 'draw') {
          drawTab.style.display = 'block';
          typeTab.style.display = 'none';
        } else {
          drawTab.style.display = 'none';
          typeTab.style.display = 'block';
        }
      });
    });

    const typedInput = this.modal.querySelector('#typed-signature') as HTMLInputElement;
    const typedPreview = this.modal.querySelector('#typed-preview') as HTMLElement;
    const fontSelect = this.modal.querySelector('#sig-font') as HTMLSelectElement;

    typedInput?.addEventListener('input', () => {
      typedPreview.textContent = typedInput.value;
    });

    fontSelect?.addEventListener('change', () => {
      typedPreview.style.fontFamily = fontSelect.value;
    });

    const cryptoCheckbox = this.modal.querySelector('#crypto-sign-checkbox') as HTMLInputElement;
    const cryptoInfo = this.modal.querySelector('#crypto-info') as HTMLElement;

    cryptoCheckbox?.addEventListener('change', async () => {
      this.useCryptoSign = cryptoCheckbox.checked;
      cryptoInfo.style.display = cryptoCheckbox.checked ? 'block' : 'none';

      if (cryptoCheckbox.checked) {
        const keyFingerprint = this.modal!.querySelector('#key-fingerprint')!;
        try {
          const publicKey = await cryptoService.exportPublicKey();
          const fingerprint = cryptoService.getPublicKeyFingerprint(publicKey);
          keyFingerprint.textContent = `Key fingerprint: ${fingerprint}`;
        } catch {
          keyFingerprint.textContent = 'Key fingerprint: Error generating key';
        }
      }
    });
  }

  private startDrawing(e: MouseEvent): void {
    this.isDrawing = true;
    const rect = this.canvas!.getBoundingClientRect();
    this.lastX = e.clientX - rect.left;
    this.lastY = e.clientY - rect.top;
  }

  private draw(e: MouseEvent): void {
    if (!this.isDrawing || !this.ctx) return;

    const rect = this.canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas!.getBoundingClientRect();
    this.isDrawing = true;
    this.lastX = touch.clientX - rect.left;
    this.lastY = touch.clientY - rect.top;
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isDrawing || !this.ctx) return;

    const touch = e.touches[0];
    const rect = this.canvas!.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.lastX = x;
    this.lastY = y;
  }

  private stopDrawing(): void {
    this.isDrawing = false;
  }

  private clear(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private async save(): Promise<void> {
    let imageData: string;
    const activeTab = this.modal?.querySelector('.tab.active')?.getAttribute('data-tab');

    if (activeTab === 'type') {
      const typedInput = this.modal?.querySelector('#typed-signature') as HTMLInputElement;
      const fontSelect = this.modal?.querySelector('#sig-font') as HTMLSelectElement;

      if (!typedInput.value.trim()) {
        toast.warning('Please type your signature');
        return;
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 400;
      tempCanvas.height = 100;
      const tempCtx = tempCanvas.getContext('2d')!;

      tempCtx.fillStyle = 'transparent';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      tempCtx.font = `32px ${fontSelect.value}`;
      tempCtx.fillStyle = '#000';
      tempCtx.textBaseline = 'middle';
      tempCtx.fillText(typedInput.value, 10, 50);

      imageData = tempCanvas.toDataURL('image/png');
    } else {
      if (!this.canvas) return;

      const canvasData = this.ctx?.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const hasDrawing = canvasData?.data.some((val, i) => i % 4 === 3 && val > 0);

      if (!hasDrawing) {
        toast.warning('Please draw your signature');
        return;
      }

      imageData = this.canvas.toDataURL('image/png');
    }

    let cryptoSignature: CryptoSignature | undefined;

    if (this.useCryptoSign) {
      try {
        toast.info('Applying cryptographic signature...');
        const encoder = new TextEncoder();
        const data = encoder.encode(imageData);
        cryptoSignature = await cryptoService.signData(data.buffer);
        toast.success('Cryptographic signature applied');
      } catch (error) {
        toast.error('Failed to apply cryptographic signature');
        console.error(error);
      }
    }

    const signatureData: SignatureData = {
      imageData,
      timestamp: Date.now(),
      cryptoSignature,
    };

    this.onSave?.(signatureData);
    this.close();
  }

  private close(): void {
    this.modal?.remove();
    this.modal = null;
    this.canvas = null;
    this.ctx = null;
    this.onSave = null;
  }
}

export const signaturePad = new SignaturePad();
