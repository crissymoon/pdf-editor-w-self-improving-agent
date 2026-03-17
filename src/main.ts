import './styles/main.css';
import { icons } from './utils/icons';
import { pdfService } from './utils/pdf';
import { toast } from './utils/toast';
import { signaturePad } from './components/SignaturePad';
import { mergeModal } from './components/MergeModal';
import { textEditor } from './components/TextEditor';
import { agentPanel } from './components/AgentPanel';
import { createDoubleAgentArchitecture } from './agent';
import { appendSanitizedHtml, setSanitizedHtml } from './utils/safeHtml';
import type { AgentToolCall } from './agent';
import type { EditorCommandRequest, EditorCommandResult } from './agent/shared/types';
import type { Annotation, SignatureData, ImageData as ImgData } from './types';
import { guardFile } from './utils/file-guard';
import { HistoryStack } from './utils/history';
import { sessionVault } from './utils/session-vault';

class PDFEditor {
  private currentPage = 1;
  private totalPages = 0;
  private zoom = 1.0;
  private pdfData: ArrayBuffer | null = null;
  private annotations: Annotation[] = [];
  private activeTool: string | null = null;
  private selectedAnnotation: Annotation | null = null;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private canvasScale = 1.5;
  private history = new HistoryStack<Annotation[]>();
  private currentFilename = 'document.pdf';
  private autosaveTimer: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.render();
    this.setupEventListeners();
    toast.init();
    this.setupAgentRuntime();
    this.setupKeyboardShortcuts();
    void this.checkSessionRecovery();
  }

  private setupAgentRuntime(): void {
    const architecture = createDoubleAgentArchitecture({
      run: (request) => this.runEditorCommand(request),
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

  private async runEditorCommand(request: EditorCommandRequest): Promise<EditorCommandResult> {
    switch (request.command) {
      case 'open_file_picker':
        this.openFilePicker();
        return { ok: true, message: 'File picker opened' };
      case 'open_merge_modal':
        this.openMergeModal();
        return { ok: true, message: 'Merge modal opened' };
      case 'create_blank_pdf': {
        const pagesRaw = Number(request.arguments?.pages ?? 1);
        const pages = Number.isFinite(pagesRaw) ? Math.max(1, Math.floor(pagesRaw)) : 1;
        const createdBytes = await pdfService.createBlankPDF(pages);
        const buffer = Uint8Array.from(createdBytes).buffer as ArrayBuffer;
        const fileLabel = pages === 1 ? 'blank-1-page.pdf' : `blank-${pages}-pages.pdf`;
        await this.loadPDF(buffer, fileLabel);
        return { ok: true, message: `Created blank PDF with ${pages} page(s)` };
      }
      case 'save_pdf':
        await this.savePDF();
        return { ok: true, message: 'Save command executed' };
      case 'set_tool': {
        const tool = String(request.arguments?.tool ?? '').trim();
        if (!this.isSupportedTool(tool)) {
          return { ok: false, message: `Unsupported tool: ${tool || 'empty'}` };
        }
        this.setActiveTool(tool);
        return { ok: true, message: `Active tool set to ${tool}` };
      }
      case 'canvas_click': {
        const x = Number(request.arguments?.x ?? NaN);
        const y = Number(request.arguments?.y ?? NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
          return { ok: false, message: 'x and y must be non-negative numbers' };
        }
        const applied = this.applyActiveToolAt(x, y);
        return {
          ok: applied,
          message: applied ? `Applied ${this.activeTool || 'tool'} at x=${x}, y=${y}` : 'No applicable active tool selected',
        };
      }
      case 'zoom_in':
        this.zoomIn();
        return { ok: true, message: 'Zoom in executed' };
      case 'zoom_out':
        this.zoomOut();
        return { ok: true, message: 'Zoom out executed' };
      case 'go_to_page': {
        const pageValue = Number(request.arguments?.page ?? 0);
        if (!Number.isInteger(pageValue) || pageValue < 1) {
          return { ok: false, message: 'Page must be an integer greater than 0' };
        }
        await this.goToPage(pageValue);
        return { ok: true, message: `Navigated to page ${pageValue}` };
      }
      case 'delete_selected_annotation': {
        const before = this.annotations.length;
        this.deleteSelectedAnnotation();
        const deleted = this.annotations.length < before;
        return {
          ok: deleted,
          message: deleted ? 'Selected annotation deleted' : 'No selected annotation to delete',
        };
      }
      case 'get_status':
        return {
          ok: true,
          message: 'Editor status collected',
          data: {
            currentPage: this.currentPage,
            totalPages: this.totalPages,
            zoom: this.zoom,
            annotations: this.annotations.length,
            activeTool: this.activeTool,
            pdfLoaded: this.pdfData !== null,
          },
        };
      default:
        return { ok: false, message: `Unsupported command: ${request.command}` };
    }
  }

  private isSupportedTool(tool: string): boolean {
    return ['select', 'text', 'image', 'signature', 'highlight', 'checkbox', 'date'].includes(tool);
  }

  private applyActiveToolAt(x: number, y: number): boolean {
    if (!this.activeTool || this.activeTool === 'select') {
      return false;
    }

    const scaledX = x / this.zoom;
    const scaledY = y / this.zoom;

    switch (this.activeTool) {
      case 'text':
        this.addTextAnnotation(scaledX, scaledY);
        return true;
      case 'image':
        this.addImageAnnotation(scaledX, scaledY);
        return true;
      case 'signature':
        this.addSignatureAnnotation(scaledX, scaledY);
        return true;
      case 'checkbox':
        this.addCheckboxAnnotation(scaledX, scaledY);
        return true;
      case 'date':
        this.addDateAnnotation(scaledX, scaledY);
        return true;
      case 'highlight':
        return false;
      default:
        return false;
    }
  }

  private render(): void {
    const app = document.getElementById('app')!;
    setSanitizedHtml(app, `
      <header class="header">
        <div class="header-brand">
          <div class="header-logo">XCM-PDF</div>
          <div class="header-subtitle">Leto's Angels Educational Project by XcaliburMoon</div>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" id="btn-open">
            ${icons.upload} Open PDF
          </button>
          <button class="btn btn-secondary" id="btn-merge">
            ${icons.merge} Merge
          </button>
          <button class="btn btn-primary" id="btn-save" disabled>
            ${icons.save} Save
          </button>
        </div>
      </header>

      <div class="main-container">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <span>Pages</span>
            <span id="page-count">0 pages</span>
          </div>
          <div class="sidebar-content" id="thumbnail-container"></div>
        </aside>

        <div class="canvas-container">
          <div class="toolbar" id="toolbar">
            <div class="toolbar-group">
              <button class="btn btn-toolbar" id="tool-select" data-tool="select" title="Select">
                ${icons.select}
              </button>
            </div>

            <div class="toolbar-group">
              <button class="btn btn-toolbar" id="tool-text" data-tool="text" title="Add Text">
                ${icons.text}
              </button>
              <button class="btn btn-toolbar" id="tool-image" data-tool="image" title="Add Image">
                ${icons.image}
              </button>
              <button class="btn btn-toolbar" id="tool-signature" data-tool="signature" title="Add Signature">
                ${icons.signature}
              </button>
            </div>

            <div class="toolbar-group">
              <button class="btn btn-toolbar" id="tool-highlight" data-tool="highlight" title="Highlight">
                ${icons.highlight}
              </button>
              <button class="btn btn-toolbar" id="tool-checkbox" data-tool="checkbox" title="Checkbox">
                ${icons.checkbox}
              </button>
              <button class="btn btn-toolbar" id="tool-date" data-tool="date" title="Insert Date">
                ${icons.calendar}
              </button>
            </div>

            <div class="toolbar-group">
              <button class="btn btn-toolbar" id="btn-delete" title="Delete Selected" disabled>
                ${icons.trash}
              </button>
            </div>

            <div class="toolbar-group">
              <button class="btn btn-toolbar" id="btn-undo" title="Undo (Ctrl+Z)" disabled>
                ${icons.undo}
              </button>
              <button class="btn btn-toolbar" id="btn-redo" title="Redo (Ctrl+Shift+Z)" disabled>
                ${icons.redo}
              </button>
            </div>

            <div class="toolbar-group zoom-controls">
              <button class="btn btn-toolbar btn-icon" id="btn-zoom-out" title="Zoom Out">
                ${icons.zoomOut}
              </button>
              <span class="zoom-value" id="zoom-value">100%</span>
              <button class="btn btn-toolbar btn-icon" id="btn-zoom-in" title="Zoom In">
                ${icons.zoomIn}
              </button>
            </div>

            <div class="toolbar-group page-nav">
              <button class="btn btn-toolbar btn-icon" id="btn-prev-page" title="Previous Page" disabled>
                ${icons.chevronLeft}
              </button>
              <input type="number" class="page-input" id="page-input" value="1" min="1">
              <span class="page-total" id="page-total">/ 0</span>
              <button class="btn btn-toolbar btn-icon" id="btn-next-page" title="Next Page" disabled>
                ${icons.chevronRight}
              </button>
            </div>
          </div>

          <div class="canvas-wrapper" id="canvas-wrapper">
            <div class="empty-state" id="empty-state">
              <div class="empty-state-icon">
                ${icons.pdf}
              </div>
              <h2 class="empty-state-title">No PDF Loaded</h2>
              <p class="empty-state-description">
                Open a PDF file to start editing, or merge multiple PDFs into one document.
              </p>
              <div class="drop-zone" id="drop-zone">
                <div style="margin-bottom: 8px;">${icons.upload}</div>
                <div style="font-weight: 500; margin-bottom: 4px;">Drop PDF file here</div>
                <div style="font-size: 12px; color: var(--color-gray-500);">or click to browse</div>
                <input type="file" id="file-input" class="hidden-input" accept=".pdf">
              </div>
            </div>

            <div class="pdf-canvas-container" id="pdf-container" style="display: none;">
              <canvas id="pdf-canvas" class="pdf-canvas"></canvas>
              <div class="annotation-layer" id="annotation-layer"></div>
            </div>
          </div>
        </div>
      </div>

      <footer class="status-bar">
        <div class="status-item">
          <span id="status-file">No file loaded</span>
        </div>
        <div class="status-item">
          <span id="status-info">XCM-PDF v1.0 - Free PDF Editor for Educational Use</span>
        </div>
      </footer>
    `);
  }

  private setupEventListeners(): void {
    document.getElementById('btn-open')?.addEventListener('click', () => this.openFilePicker());
    document.getElementById('btn-merge')?.addEventListener('click', () => this.openMergeModal());
    document.getElementById('btn-save')?.addEventListener('click', () => this.savePDF());

    document.getElementById('drop-zone')?.addEventListener('click', () => this.openFilePicker());
    document.getElementById('file-input')?.addEventListener('change', (e) => this.handleFileInput(e));

    const dropZone = document.getElementById('drop-zone');
    const canvasWrapper = document.getElementById('canvas-wrapper');

    [dropZone, canvasWrapper].forEach(el => {
      el?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone?.classList.add('dragover');
      });

      el?.addEventListener('dragleave', () => {
        dropZone?.classList.remove('dragover');
      });

      el?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone?.classList.remove('dragover');
        const files = (e as DragEvent).dataTransfer?.files;
        if (files?.[0]) {
          this.loadPDFFile(files[0]);
        }
      });
    });

    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        this.setActiveTool(tool);
      });
    });

    document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelectedAnnotation());
  document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
  document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.zoomOut());

    document.getElementById('btn-prev-page')?.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    document.getElementById('btn-next-page')?.addEventListener('click', () => this.goToPage(this.currentPage + 1));
    document.getElementById('page-input')?.addEventListener('change', (e) => {
      const page = parseInt((e.target as HTMLInputElement).value);
      this.goToPage(page);
    });

    const annotationLayer = document.getElementById('annotation-layer');
    annotationLayer?.addEventListener('click', (e) => this.handleCanvasClick(e));
    annotationLayer?.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    annotationLayer?.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    annotationLayer?.addEventListener('mouseup', () => this.handleMouseUp());
    annotationLayer?.addEventListener('mouseleave', () => this.handleMouseUp());
  }

  private openFilePicker(): void {
    const input = document.getElementById('file-input') as HTMLInputElement;
    input?.click();
  }

  private handleFileInput(e: Event): void {
    const files = (e.target as HTMLInputElement).files;
    if (files?.[0]) {
      this.loadPDFFile(files[0]);
    }
  }

  private async loadPDFFile(file: File): Promise<void> {
    const guard = await guardFile(file);

    for (const v of guard.violations) {
      if (v.severity === 'block') {
        toast.error(`File rejected: ${v.message}`);
      } else {
        toast.warning(`File warning: ${v.message}`);
      }
    }

    if (!guard.ok) return;

    try {
      toast.info('Loading PDF...');
      const buffer = await file.arrayBuffer();
      await this.loadPDF(buffer, file.name);
    } catch (error) {
      console.error('Load error:', error);
      toast.error('Failed to load PDF');
    }
  }

  private async loadPDF(data: ArrayBuffer, filename: string = 'document.pdf'): Promise<void> {
    this.pdfData = data;
    this.annotations = [];
    this.selectedAnnotation = null;
    this.currentFilename = filename;
    this.history.clear();

    await pdfService.loadPDF(data);
    this.totalPages = await pdfService.getPageCount();
    this.currentPage = 1;

    document.getElementById('empty-state')!.style.display = 'none';
    document.getElementById('pdf-container')!.style.display = 'block';

    this.updatePageControls();
    await this.renderCurrentPage();
    await this.renderThumbnails();

    (document.getElementById('btn-save') as HTMLButtonElement).disabled = false;
    document.getElementById('status-file')!.textContent = filename;
    document.getElementById('page-count')!.textContent = `${this.totalPages} pages`;

    toast.success('PDF loaded successfully');
    this.updateUndoRedoButtons();
    this.scheduleAutosave();
  }

  private async renderCurrentPage(): Promise<void> {
    const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
    const scale = this.canvasScale * this.zoom;

    await pdfService.renderPage(this.currentPage, canvas, scale);
    this.renderAnnotations();
  }

  private async renderThumbnails(): Promise<void> {
    const container = document.getElementById('thumbnail-container')!;
    container.replaceChildren();

    for (let i = 1; i <= this.totalPages; i++) {
      const div = document.createElement('div');
      div.className = `page-thumbnail ${i === this.currentPage ? 'active' : ''}`;
      div.dataset.page = i.toString();

      const canvas = document.createElement('canvas');
      div.appendChild(canvas);

      const pageNum = document.createElement('div');
      pageNum.className = 'page-number';
      pageNum.textContent = i.toString();
      div.appendChild(pageNum);

      container.appendChild(div);

      div.addEventListener('click', () => this.goToPage(i));

      await pdfService.renderThumbnail(i, canvas, 230);
    }
  }

  private async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages) return;

    this.currentPage = page;
    this.updatePageControls();
    await this.renderCurrentPage();

    document.querySelectorAll('.page-thumbnail').forEach(thumb => {
      thumb.classList.toggle('active', parseInt(thumb.getAttribute('data-page') || '0') === page);
    });
  }

  private updatePageControls(): void {
    const prevBtn = document.getElementById('btn-prev-page') as HTMLButtonElement;
    const nextBtn = document.getElementById('btn-next-page') as HTMLButtonElement;
    const pageInput = document.getElementById('page-input') as HTMLInputElement;
    const pageTotal = document.getElementById('page-total');

    prevBtn.disabled = this.currentPage <= 1;
    nextBtn.disabled = this.currentPage >= this.totalPages;
    pageInput.value = this.currentPage.toString();
    pageInput.max = this.totalPages.toString();
    pageTotal!.textContent = `/ ${this.totalPages}`;
  }

  private zoomIn(): void {
    if (this.zoom < 3) {
      this.zoom = Math.min(3, this.zoom + 0.25);
      this.updateZoom();
    }
  }

  private zoomOut(): void {
    if (this.zoom > 0.25) {
      this.zoom = Math.max(0.25, this.zoom - 0.25);
      this.updateZoom();
    }
  }

  private async updateZoom(): Promise<void> {
    document.getElementById('zoom-value')!.textContent = `${Math.round(this.zoom * 100)}%`;
    await this.renderCurrentPage();
  }

  private setActiveTool(tool: string | null): void {
    this.activeTool = tool;

    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
    });

    const annotationLayer = document.getElementById('annotation-layer');
    if (annotationLayer) {
      annotationLayer.classList.toggle('active', tool !== null);

      if (tool === 'highlight') {
        annotationLayer.style.cursor = 'crosshair';
      } else if (tool === 'select') {
        annotationLayer.style.cursor = 'default';
      } else if (tool) {
        annotationLayer.style.cursor = 'crosshair';
      }
    }
  }

  private handleCanvasClick(e: MouseEvent): void {
    if (!this.activeTool || this.activeTool === 'select') {
      this.selectAnnotationAt(e);
      return;
    }

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoom;
    const y = (e.clientY - rect.top) / this.zoom;

    switch (this.activeTool) {
      case 'text':
        this.addTextAnnotation(x, y);
        break;
      case 'image':
        this.addImageAnnotation(x, y);
        break;
      case 'signature':
        this.addSignatureAnnotation(x, y);
        break;
      case 'checkbox':
        this.addCheckboxAnnotation(x, y);
        break;
      case 'date':
        this.addDateAnnotation(x, y);
        break;
      case 'highlight':
        break;
    }
  }

  private addTextAnnotation(x: number, y: number): void {
    textEditor.open((options) => {
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'text',
        pageIndex: this.currentPage - 1,
        x: x / this.canvasScale,
        y: y / this.canvasScale,
        width: 200,
        height: options.fontSize + 4,
        content: options.text,
        style: {
          fontSize: options.fontSize,
          fontFamily: options.fontFamily,
          color: options.color,
        },
      };

      this.snapshotAnnotations();
      this.annotations.push(annotation);
      this.renderAnnotations();
      this.scheduleAutosave();
      toast.success('Text added');
    });
  }

  private addImageAnnotation(x: number, y: number): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxSize = 200;
          let width = img.width;
          let height = img.height;

          if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width *= ratio;
            height *= ratio;
          }

          const imgData: ImgData = {
            src: e.target?.result as string,
            originalWidth: img.width,
            originalHeight: img.height,
          };

          const annotation: Annotation = {
            id: crypto.randomUUID(),
            type: 'image',
            pageIndex: this.currentPage - 1,
            x: x / this.canvasScale,
            y: y / this.canvasScale,
            width: width,
            height: height,
            content: imgData,
          };

          this.snapshotAnnotations();
          this.annotations.push(annotation);
          this.renderAnnotations();
          this.scheduleAutosave();
          toast.success('Image added');
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });

    input.click();
  }

  private addSignatureAnnotation(x: number, y: number): void {
    signaturePad.open((signature: SignatureData) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 200;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width *= ratio;
          height *= ratio;
        }

        const annotation: Annotation = {
          id: crypto.randomUUID(),
          type: 'signature',
          pageIndex: this.currentPage - 1,
          x: x / this.canvasScale,
          y: y / this.canvasScale,
          width: width,
          height: height,
          content: signature,
        };

        this.snapshotAnnotations();
        this.annotations.push(annotation);
        this.renderAnnotations();
        this.scheduleAutosave();

        if (signature.cryptoSignature) {
          toast.success('Cryptographic signature added');
        } else {
          toast.success('Signature added');
        }
      };
      img.src = signature.imageData;
    });
  }

  private addCheckboxAnnotation(x: number, y: number): void {
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: 'checkbox',
      pageIndex: this.currentPage - 1,
      x: x / this.canvasScale,
      y: y / this.canvasScale,
      width: 20,
      height: 20,
      content: 'unchecked',
    };

    this.snapshotAnnotations();
    this.annotations.push(annotation);
    this.renderAnnotations();
    this.scheduleAutosave();
    toast.success('Checkbox added');
  }

  private addDateAnnotation(x: number, y: number): void {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: 'date',
      pageIndex: this.currentPage - 1,
      x: x / this.canvasScale,
      y: y / this.canvasScale,
      width: 150,
      height: 20,
      content: dateStr,
      style: {
        fontSize: 12,
        color: '#000000',
      },
    };

    this.snapshotAnnotations();
    this.annotations.push(annotation);
    this.renderAnnotations();
    this.scheduleAutosave();
    toast.success('Date added');
  }

  private renderAnnotations(): void {
    const layer = document.getElementById('annotation-layer')!;
    layer.replaceChildren();

    const pageAnnotations = this.annotations.filter(a => a.pageIndex === this.currentPage - 1);

    for (const annotation of pageAnnotations) {
      const el = this.createAnnotationElement(annotation);
      layer.appendChild(el);
    }
  }

  private createAnnotationElement(annotation: Annotation): HTMLElement {
    const el = document.createElement('div');
    el.className = `annotation annotation-${annotation.type}`;
    el.dataset.id = annotation.id;
    el.style.position = 'absolute';
    el.style.left = `${annotation.x * this.canvasScale * this.zoom}px`;
    el.style.top = `${annotation.y * this.canvasScale * this.zoom}px`;
    el.style.width = `${annotation.width * this.zoom}px`;
    el.style.height = `${annotation.height * this.zoom}px`;

    if (this.selectedAnnotation?.id === annotation.id) {
      el.style.outline = '2px solid var(--color-purple)';
      el.style.outlineOffset = '2px';
    }

    switch (annotation.type) {
      case 'text': {
        el.style.fontSize = `${(annotation.style?.fontSize || 14) * this.zoom}px`;
        el.style.color = annotation.style?.color || '#000';
        el.style.fontFamily = annotation.style?.fontFamily || 'Helvetica, Arial, sans-serif';
        el.style.whiteSpace = 'pre-wrap';
        el.style.width = 'auto';
        el.style.height = 'auto';
        el.textContent = annotation.content as string;
        break;
      }

      case 'image':
      case 'signature': {
        const img = document.createElement('img');

        if (annotation.type === 'signature') {
          const sigData = annotation.content as SignatureData;
          img.src = sigData.imageData;

          if (sigData.cryptoSignature) {
            el.style.borderBottom = '2px solid #10b981';
            el.title = 'Cryptographically signed';
          }
        } else {
          const imgData = annotation.content as ImgData;
          img.src = imgData.src;
        }

        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.draggable = false;
        el.appendChild(img);
        break;
      }

      case 'checkbox': {
        el.style.border = '1px solid #000';
        el.style.backgroundColor = '#fff';
        el.style.cursor = 'pointer';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        if (annotation.content === 'checked') {
          appendSanitizedHtml(el, icons.check);
          el.style.color = '#000';
        }

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.snapshotAnnotations();
          annotation.content = annotation.content === 'checked' ? 'unchecked' : 'checked';
          this.renderAnnotations();
          this.scheduleAutosave();
        });
        break;
      }

      case 'date': {
        el.style.fontSize = `${(annotation.style?.fontSize || 12) * this.zoom}px`;
        el.style.color = annotation.style?.color || '#000';
        el.style.fontFamily = 'Helvetica, Arial, sans-serif';
        el.style.width = 'auto';
        el.textContent = annotation.content as string;
        break;
      }

      case 'highlight': {
        el.style.backgroundColor = annotation.style?.color || '#ffff00';
        el.style.opacity = '0.3';
        break;
      }
    }

    return el;
  }

  private selectAnnotationAt(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const annotationEl = target.closest('.annotation') as HTMLElement;

    if (annotationEl) {
      const id = annotationEl.dataset.id;
      this.selectedAnnotation = this.annotations.find(a => a.id === id) || null;
    } else {
      this.selectedAnnotation = null;
    }

    (document.getElementById('btn-delete') as HTMLButtonElement).disabled = !this.selectedAnnotation;
    this.renderAnnotations();
  }

  private handleMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const annotationEl = target.closest('.annotation') as HTMLElement;

    if (annotationEl && this.activeTool === 'select') {
      const id = annotationEl.dataset.id;
      this.selectedAnnotation = this.annotations.find(a => a.id === id) || null;

      if (this.selectedAnnotation) {
        this.snapshotAnnotations();
        this.isDragging = true;
        const rect = annotationEl.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
        e.preventDefault();
      }
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging || !this.selectedAnnotation) return;

    const layer = document.getElementById('annotation-layer')!;
    const rect = layer.getBoundingClientRect();

    const x = (e.clientX - rect.left - this.dragOffsetX) / this.zoom / this.canvasScale;
    const y = (e.clientY - rect.top - this.dragOffsetY) / this.zoom / this.canvasScale;

    this.selectedAnnotation.x = Math.max(0, x);
    this.selectedAnnotation.y = Math.max(0, y);

    this.renderAnnotations();
  }

  private handleMouseUp(): void {
    if (this.isDragging) {
      this.scheduleAutosave();
    }
    this.isDragging = false;
  }

  private deleteSelectedAnnotation(): void {
    if (!this.selectedAnnotation) return;

    this.snapshotAnnotations();
    this.annotations = this.annotations.filter(a => a.id !== this.selectedAnnotation!.id);
    this.selectedAnnotation = null;
    (document.getElementById('btn-delete') as HTMLButtonElement).disabled = true;
    this.renderAnnotations();
    this.scheduleAutosave();
    toast.success('Annotation deleted');
  }

  private snapshotAnnotations(): void {
    this.history.checkpoint(this.annotations);
    this.updateUndoRedoButtons();
  }

  private undo(): void {
    const previous = this.history.undo(this.annotations);
    if (previous === null) return;
    this.annotations = previous;
    this.selectedAnnotation = null;
    (document.getElementById('btn-delete') as HTMLButtonElement).disabled = true;
    this.renderAnnotations();
    this.updateUndoRedoButtons();
    this.scheduleAutosave();
  }

  private redo(): void {
    const next = this.history.redo(this.annotations);
    if (next === null) return;
    this.annotations = next;
    this.selectedAnnotation = null;
    (document.getElementById('btn-delete') as HTMLButtonElement).disabled = true;
    this.renderAnnotations();
    this.updateUndoRedoButtons();
    this.scheduleAutosave();
  }

  private updateUndoRedoButtons(): void {
    const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement | null;
    const redoBtn = document.getElementById('btn-redo') as HTMLButtonElement | null;
    if (undoBtn) undoBtn.disabled = !this.history.canUndo;
    if (redoBtn) redoBtn.disabled = !this.history.canRedo;
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer !== null) {
      window.clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      if (this.pdfData) {
        void sessionVault.save(this.currentFilename, this.pdfData, this.annotations);
      }
    }, 2000);
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        this.redo();
      }
    });
  }

  private async checkSessionRecovery(): Promise<void> {
    const session = await sessionVault.recover();
    if (!session) return;

    const bar = document.createElement('div');
    bar.className = 'recovery-bar';
    bar.innerHTML = [
      '<span class="recovery-bar-msg">',
      `Unsaved session found: <strong>${session.filename}</strong>`,
      ` &nbsp;(${new Date(session.timestamp).toLocaleTimeString()})`,
      '</span>',
      '<button class="recovery-bar-btn recovery-bar-btn--restore">Restore</button>',
      '<button class="recovery-bar-btn recovery-bar-btn--dismiss">Dismiss</button>',
    ].join('');

    document.body.prepend(bar);

    bar.querySelector('.recovery-bar-btn--restore')?.addEventListener('click', async () => {
      bar.remove();
      await this.loadPDF(session.pdfBytes, session.filename);
      this.annotations = session.annotations;
      this.renderAnnotations();
      toast.success('Session restored');
    });

    bar.querySelector('.recovery-bar-btn--dismiss')?.addEventListener('click', () => {
      bar.remove();
      void sessionVault.clear();
    });
  }

  private openMergeModal(): void {
    mergeModal.open(async (data: ArrayBuffer) => {
      await this.loadPDF(data, 'merged.pdf');
    });
  }

  private async savePDF(): Promise<void> {
    if (!this.pdfData) {
      toast.error('No PDF loaded');
      return;
    }

    try {
      toast.info('Saving PDF...');

      const scaleRatio = 1 / this.canvasScale;
      const scaledAnnotations = this.annotations.map(a => ({
        ...a,
        x: a.x * scaleRatio * this.canvasScale,
        y: a.y * scaleRatio * this.canvasScale,
        width: a.width * scaleRatio,
        height: a.height * scaleRatio,
      }));

      const pdfBytes = await pdfService.applyAnnotationsAndSave(scaledAnnotations);

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'xcm-pdf-edited.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('PDF saved successfully');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save PDF');
    }
  }
}

new PDFEditor();
