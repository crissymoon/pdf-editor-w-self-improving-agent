import './styles/main.css';
import './styles/responsive.css';
import { pdfService } from './utils/pdf';
import { toast } from './utils/toast';
import { responsive, setupSafeAreaVariables } from './utils/responsive';
import type { EditorCommandRequest, EditorCommandResult } from './agent/shared/types';
import type { Annotation } from './types';
import { guardFile } from './utils/file-guard';
import { HistoryStack } from './utils/history';
import {
  addCheckboxAnnotation,
  addDateAnnotation,
  addImageAnnotation,
  addSignatureAnnotation,
  addTextAnnotation,
  handleCanvasClick,
} from './editor/annotation-actions';
import { createAnnotationElement } from './editor/annotation-dom';
import {
  applyImageSizeModeToSelected,
  buildCurrentPDFBytes,
  checkSessionRecovery,
  emailCurrentPDF,
  openMergeModal,
  savePDF,
  scheduleAutosave,
  setupKeyboardShortcuts,
} from './editor/actions';
import { runEditorCommand, setupAgentRuntime } from './editor/agent-runtime';
import { setupEditorEventListeners } from './editor/event-bindings';
import {
  applyColorFromPropertiesBar,
  openTextPopupEditor,
  startInlineTextEdit,
  updatePropertiesBar,
} from './editor/properties';
import { renderEditorShell } from './editor/render-shell';

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
  private isDrawingHighlight = false;
  private highlightStartX = 0;
  private highlightStartY = 0;
  private isResizingImage = false;
  private activeResizeHandle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null = null;
  private resizeStartScreenX = 0;
  private resizeStartScreenY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private activePointerId: number | null = null;
  private activeTouchPointerIds = new Set<number>();
  private activeHighlightColor = '#ffff00';
  private activeTextColor = '#000000';
  private imageSizingMode: 'auto' | 'regular' = 'auto';
  private editingTextAnnotationId: string | null = null;
  private canvasScale = 1.5;
  private history = new HistoryStack<Annotation[]>();
  private currentFilename = 'document.pdf';
  private autosaveTimer: number | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    // Initialize responsive design system
    responsive.setupViewportMeta();
    setupSafeAreaVariables();
    responsive.applyResponsiveClass(document.documentElement);
    
    this.render();
    this.setupEventListeners();
    toast.init();
    this.setupAgentRuntime();
    this.setupKeyboardShortcuts();
    void this.checkSessionRecovery();
  }

  private setupAgentRuntime(): void {
    setupAgentRuntime({
      runEditorCommand: (request) => this.runEditorCommand(request),
    });
  }

  private async runEditorCommand(request: EditorCommandRequest): Promise<EditorCommandResult> {
    return runEditorCommand(request, {
      openFilePicker: () => this.openFilePicker(),
      openMergeModal: () => this.openMergeModal(),
      loadPDF: (data, filename) => this.loadPDF(data, filename),
      savePDF: () => this.savePDF(),
      emailCurrentPDF: (input) => this.emailCurrentPDF(input),
      isSupportedTool: (tool) => this.isSupportedTool(tool),
      setActiveTool: (tool) => this.setActiveTool(tool),
      applyActiveToolAt: (x, y) => this.applyActiveToolAt(x, y),
      getActiveTool: () => this.activeTool,
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      goToPage: (page) => this.goToPage(page),
      deleteSelectedAnnotation: () => this.deleteSelectedAnnotation(),
      getAnnotationsCount: () => this.annotations.length,
      getStatus: () => ({
        currentPage: this.currentPage,
        totalPages: this.totalPages,
        zoom: this.zoom,
        activeTool: this.activeTool,
        pdfLoaded: this.pdfData !== null,
      }),
    });
  }

  private isSupportedTool(tool: string): boolean {
    return ['select', 'text', 'image', 'signature', 'highlight', 'checkbox', 'date'].includes(tool);
  }

  private preferPopupTextEditor(): boolean {
    return window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  }

  private getImageSizeForMode(originalWidth: number, originalHeight: number, mode: 'auto' | 'regular'): { width: number; height: number } {
    if (mode === 'regular') {
      return {
        width: originalWidth,
        height: originalHeight,
      };
    }

    const maxSize = 200;
    let width = originalWidth;
    let height = originalHeight;
    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height);
      width *= ratio;
      height *= ratio;
    }
    return { width, height };
  }

  private updateTouchPointers(e: PointerEvent, isDown: boolean): void {
    if (e.pointerType !== 'touch') return;
    if (isDown) {
      this.activeTouchPointerIds.add(e.pointerId);
    } else {
      this.activeTouchPointerIds.delete(e.pointerId);
    }
  }

  private isMultiTouchGesture(): boolean {
    return this.activeTouchPointerIds.size > 1;
  }

  private clearActiveInteractionState(): void {
    const layer = document.getElementById('annotation-layer');
    if (this.activePointerId !== null && layer?.hasPointerCapture(this.activePointerId)) {
      layer.releasePointerCapture(this.activePointerId);
    }

    this.activePointerId = null;
    this.isDragging = false;
    this.isDrawingHighlight = false;
    this.isResizingImage = false;
    this.activeResizeHandle = null;
    document.getElementById('highlight-preview')?.remove();
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
    renderEditorShell();
  }

  private setupEventListeners(): void {
    setupEditorEventListeners({
      createNewPDF: () => this.createNewPDF(),
      openFilePicker: () => this.openFilePicker(),
      openMergeModal: () => this.openMergeModal(),
      savePDF: () => this.savePDF(),
      handleFileInput: (event) => this.handleFileInput(event),
      loadPDFFile: (file) => this.loadPDFFile(file),
      setActiveTool: (tool) => this.setActiveTool(tool),
      deleteSelectedAnnotation: () => this.deleteSelectedAnnotation(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      setImageSizingMode: (mode) => {
        this.imageSizingMode = mode;
      },
      updatePropertiesBar: () => this.updatePropertiesBar(),
      applyImageSizeModeToSelected: () => this.applyImageSizeModeToSelected(),
      applyColorFromPropertiesBar: (color) => this.applyColorFromPropertiesBar(color),
      getSelectedAnnotation: () => this.selectedAnnotation,
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      getCurrentPage: () => this.currentPage,
      goToPage: (page) => this.goToPage(page),
      handleCanvasClick: (event) => this.handleCanvasClick(event),
      handleMouseDown: (event) => this.handleMouseDown(event),
      handleMouseMove: (event) => this.handleMouseMove(event),
      handleMouseUp: (event) => this.handleMouseUp(event),
    });
  }

  private openFilePicker(): void {
    const input = document.getElementById('file-input') as HTMLInputElement;
    input?.click();
  }

  private async createNewPDF(): Promise<void> {
    try {
      toast.info('Creating blank PDF...');
      const bytes = await pdfService.createBlankPDF(1);
      const buffer = Uint8Array.from(bytes).buffer as ArrayBuffer;
      await this.loadPDF(buffer, 'new-document.pdf');
      toast.success('New blank PDF created');
    } catch (error) {
      console.error('Create PDF error:', error);
      toast.error('Failed to create new PDF');
    }
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

    // Deselect when switching tool (except select tool)
    if (tool && tool !== 'select') {
      this.selectedAnnotation = null;
      (document.getElementById('btn-delete') as HTMLButtonElement | null)!.disabled = true;
    }

    this.updatePropertiesBar();
  }

  private handleCanvasClick(e: MouseEvent): void {
    handleCanvasClick({
      event: e,
      activeTool: this.activeTool,
      zoom: this.zoom,
      selectAnnotationAt: (event) => this.selectAnnotationAt(event),
      addTextAnnotation: (x, y) => this.addTextAnnotation(x, y),
      addImageAnnotation: (x, y) => this.addImageAnnotation(x, y),
      addSignatureAnnotation: (x, y) => this.addSignatureAnnotation(x, y),
      addCheckboxAnnotation: (x, y) => this.addCheckboxAnnotation(x, y),
      addDateAnnotation: (x, y) => this.addDateAnnotation(x, y),
    });
  }

  private addTextAnnotation(x: number, y: number): void {
    addTextAnnotation({
      x,
      y,
      currentPage: this.currentPage,
      canvasScale: this.canvasScale,
      activeTextColor: this.activeTextColor,
      setActiveTextColor: (color) => {
        this.activeTextColor = color;
      },
      annotations: this.annotations,
      snapshotAnnotations: () => this.snapshotAnnotations(),
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
      updatePropertiesBar: () => this.updatePropertiesBar(),
    });
  }

  private addImageAnnotation(x: number, y: number): void {
    addImageAnnotation({
      x,
      y,
      currentPage: this.currentPage,
      canvasScale: this.canvasScale,
      imageSizingMode: this.imageSizingMode,
      annotations: this.annotations,
      getImageSizeForMode: (originalWidth, originalHeight, mode) => this.getImageSizeForMode(originalWidth, originalHeight, mode),
      snapshotAnnotations: () => this.snapshotAnnotations(),
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
    });
  }

  private addSignatureAnnotation(x: number, y: number): void {
    addSignatureAnnotation({
      x,
      y,
      currentPage: this.currentPage,
      canvasScale: this.canvasScale,
      annotations: this.annotations,
      snapshotAnnotations: () => this.snapshotAnnotations(),
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
    });
  }

  private addCheckboxAnnotation(x: number, y: number): void {
    addCheckboxAnnotation({
      x,
      y,
      currentPage: this.currentPage,
      canvasScale: this.canvasScale,
      annotations: this.annotations,
      snapshotAnnotations: () => this.snapshotAnnotations(),
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
    });
  }

  private addDateAnnotation(x: number, y: number): void {
    addDateAnnotation({
      x,
      y,
      currentPage: this.currentPage,
      canvasScale: this.canvasScale,
      annotations: this.annotations,
      snapshotAnnotations: () => this.snapshotAnnotations(),
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
    });
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
    return createAnnotationElement({
      annotation,
      canvasScale: this.canvasScale,
      zoom: this.zoom,
      selectedAnnotationId: this.selectedAnnotation?.id ?? null,
      activeTool: this.activeTool,
      onToggleCheckbox: (targetAnnotation) => {
        this.snapshotAnnotations();
        targetAnnotation.content = targetAnnotation.content === 'checked' ? 'unchecked' : 'checked';
        this.renderAnnotations();
        this.scheduleAutosave();
      },
    });
  }

  private selectAnnotationAt(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('.annotation-text-editing')) {
      return;
    }

    const annotationEl = target.closest('.annotation') as HTMLElement;
    let selectedWasText = false;

    if (annotationEl) {
      const id = annotationEl.dataset.id;
      this.selectedAnnotation = this.annotations.find(a => a.id === id) || null;
      selectedWasText = this.selectedAnnotation?.type === 'text';
    } else {
      this.selectedAnnotation = null;
    }

    (document.getElementById('btn-delete') as HTMLButtonElement).disabled = !this.selectedAnnotation;
    this.renderAnnotations();
    this.updatePropertiesBar();

    if (this.activeTool === 'select' && selectedWasText && this.selectedAnnotation?.id) {
      if (this.preferPopupTextEditor()) {
        this.openTextPopupEditor(this.selectedAnnotation.id);
      } else {
        this.startInlineTextEdit(this.selectedAnnotation.id);
      }
    }
  }

  private handleMouseDown(e: MouseEvent | PointerEvent): void {
    const target = e.target as HTMLElement;

    if (e instanceof PointerEvent) {
      this.updateTouchPointers(e, true);
      if (this.isMultiTouchGesture()) {
        // Ignore annotation interactions during pinch/two-finger gestures.
        this.clearActiveInteractionState();
        return;
      }

      this.activePointerId = e.pointerId;
      const layer = document.getElementById('annotation-layer');
      layer?.setPointerCapture(e.pointerId);
    }

    if (this.activeTool === 'select') {
      const resizeHandle = target.closest('.resize-handle') as HTMLElement | null;
      if (resizeHandle && this.selectedAnnotation?.type === 'image') {
        this.snapshotAnnotations();
        this.isResizingImage = true;
        this.activeResizeHandle = (resizeHandle.dataset.resizeHandle as 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') || null;
        this.resizeStartScreenX = e.clientX;
        this.resizeStartScreenY = e.clientY;
        this.resizeStartWidth = this.selectedAnnotation.width;
        this.resizeStartHeight = this.selectedAnnotation.height;
        this.resizeStartX = this.selectedAnnotation.x;
        this.resizeStartY = this.selectedAnnotation.y;
        e.preventDefault();
        return;
      }
    }

    if (this.activeTool === 'highlight') {
      const layer = document.getElementById('annotation-layer')!;
      const rect = layer.getBoundingClientRect();
      this.highlightStartX = e.clientX - rect.left;
      this.highlightStartY = e.clientY - rect.top;
      this.isDrawingHighlight = true;
      e.preventDefault();
      return;
    }

    const annotationEl = target.closest('.annotation') as HTMLElement;

    if (annotationEl && this.activeTool === 'select') {
      const id = annotationEl.dataset.id;
      this.selectedAnnotation = this.annotations.find(a => a.id === id) || null;

      if (this.selectedAnnotation) {
        if (this.selectedAnnotation.type === 'text' && !this.preferPopupTextEditor()) {
          e.preventDefault();
          return;
        }
        this.snapshotAnnotations();
        this.isDragging = true;
        const rect = annotationEl.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
        e.preventDefault();
      }
    }
  }

  private handleMouseMove(e: MouseEvent | PointerEvent): void {
    if (e instanceof PointerEvent && e.pointerType === 'touch' && this.isMultiTouchGesture()) {
      return;
    }

    if (e instanceof PointerEvent && this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }

    if (this.isResizingImage && this.selectedAnnotation?.type === 'image' && this.activeResizeHandle) {
      const dxPx = e.clientX - this.resizeStartScreenX;
      const dyPx = e.clientY - this.resizeStartScreenY;
      const dxWidth = dxPx / this.zoom;
      const dyHeight = dyPx / this.zoom;
      const dxPos = dxPx / (this.zoom * this.canvasScale);
      const dyPos = dyPx / (this.zoom * this.canvasScale);

      let nextWidth = this.resizeStartWidth;
      let nextHeight = this.resizeStartHeight;
      let nextX = this.resizeStartX;
      let nextY = this.resizeStartY;

      if (this.activeResizeHandle.includes('e')) {
        nextWidth = this.resizeStartWidth + dxWidth;
      }
      if (this.activeResizeHandle.includes('s')) {
        nextHeight = this.resizeStartHeight + dyHeight;
      }
      if (this.activeResizeHandle.includes('w')) {
        nextWidth = this.resizeStartWidth - dxWidth;
        nextX = this.resizeStartX + dxPos;
      }
      if (this.activeResizeHandle.includes('n')) {
        nextHeight = this.resizeStartHeight - dyHeight;
        nextY = this.resizeStartY + dyPos;
      }

      const minSize = 24;
      if (nextWidth < minSize) {
        if (this.activeResizeHandle.includes('w')) {
          nextX = this.resizeStartX + (this.resizeStartWidth - minSize) / this.canvasScale;
        }
        nextWidth = minSize;
      }
      if (nextHeight < minSize) {
        if (this.activeResizeHandle.includes('n')) {
          nextY = this.resizeStartY + (this.resizeStartHeight - minSize) / this.canvasScale;
        }
        nextHeight = minSize;
      }

      this.selectedAnnotation.x = Math.max(0, nextX);
      this.selectedAnnotation.y = Math.max(0, nextY);
      this.selectedAnnotation.width = nextWidth;
      this.selectedAnnotation.height = nextHeight;
      this.renderAnnotations();
      return;
    }

    if (this.isDrawingHighlight) {
      const layer = document.getElementById('annotation-layer')!;
      const rect = layer.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      const x = Math.min(this.highlightStartX, curX);
      const y = Math.min(this.highlightStartY, curY);
      const w = Math.abs(curX - this.highlightStartX);
      const h = Math.abs(curY - this.highlightStartY);

      let preview = document.getElementById('highlight-preview');
      if (!preview) {
        preview = document.createElement('div');
        preview.id = 'highlight-preview';
        layer.appendChild(preview);
      }
      preview.style.left = `${x}px`;
      preview.style.top = `${y}px`;
      preview.style.width = `${w}px`;
      preview.style.height = `${h}px`;
      preview.style.backgroundColor = this.activeHighlightColor;
      return;
    }

    if (!this.isDragging || !this.selectedAnnotation) return;

    const layer = document.getElementById('annotation-layer')!;
    const rect = layer.getBoundingClientRect();

    const x = (e.clientX - rect.left - this.dragOffsetX) / this.zoom / this.canvasScale;
    const y = (e.clientY - rect.top - this.dragOffsetY) / this.zoom / this.canvasScale;

    this.selectedAnnotation.x = Math.max(0, x);
    this.selectedAnnotation.y = Math.max(0, y);

    this.renderAnnotations();
  }

  private handleMouseUp(e?: MouseEvent | PointerEvent): void {
    if (e instanceof PointerEvent) {
      this.updateTouchPointers(e, false);
    }

    if (this.isMultiTouchGesture()) {
      this.clearActiveInteractionState();
      return;
    }

    if (e instanceof PointerEvent && this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }

    if (e instanceof PointerEvent && this.activePointerId !== null) {
      const layer = document.getElementById('annotation-layer');
      if (layer?.hasPointerCapture(this.activePointerId)) {
        layer.releasePointerCapture(this.activePointerId);
      }
    }
    this.activePointerId = null;

    if (this.isResizingImage) {
      this.isResizingImage = false;
      this.activeResizeHandle = null;
      this.scheduleAutosave();
      this.updatePropertiesBar();
      return;
    }

    if (this.isDrawingHighlight) {
      this.isDrawingHighlight = false;
      const preview = document.getElementById('highlight-preview');
      if (preview) {
        const x = parseFloat(preview.style.left);
        const y = parseFloat(preview.style.top);
        const w = parseFloat(preview.style.width);
        const h = parseFloat(preview.style.height);
        preview.remove();
        if (w > 5 && h > 5) {
          this.addHighlightAnnotation(x, y, w, h);
        }
      }
      return;
    }

    if (this.isDragging) {
      this.scheduleAutosave();
    }
    this.isDragging = false;
  }

  private addHighlightAnnotation(screenX: number, screenY: number, screenW: number, screenH: number): void {
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: 'highlight',
      pageIndex: this.currentPage - 1,
      x: screenX / this.zoom / this.canvasScale,
      y: screenY / this.zoom / this.canvasScale,
      width: screenW / this.zoom,
      height: screenH / this.zoom,
      content: '',
      style: {
        color: this.activeHighlightColor,
        opacity: 0.3,
      },
    };

    this.snapshotAnnotations();
    this.annotations.push(annotation);
    this.renderAnnotations();
    this.scheduleAutosave();
    toast.success('Highlight added');
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

  private updatePropertiesBar(): void {
    updatePropertiesBar({
      selectedAnnotation: this.selectedAnnotation,
      activeTool: this.activeTool,
      activeHighlightColor: this.activeHighlightColor,
      activeTextColor: this.activeTextColor,
      imageSizingMode: this.imageSizingMode,
    });
  }

  private applyColorFromPropertiesBar(color: string): void {
    const nextColors = applyColorFromPropertiesBar({
      color,
      selectedAnnotation: this.selectedAnnotation,
      activeTool: this.activeTool,
      activeHighlightColor: this.activeHighlightColor,
      activeTextColor: this.activeTextColor,
      snapshotAnnotations: () => this.snapshotAnnotations(),
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
      updatePropertiesBar: () => this.updatePropertiesBar(),
    });
    this.activeHighlightColor = nextColors.activeHighlightColor;
    this.activeTextColor = nextColors.activeTextColor;
    this.updatePropertiesBar();
  }

  private startInlineTextEdit(annotationId: string): void {
    startInlineTextEdit({
      annotationId,
      annotations: this.annotations,
      editingTextAnnotationId: this.editingTextAnnotationId,
      snapshotAnnotations: () => this.snapshotAnnotations(),
      setEditingTextAnnotationId: (nextId) => {
        this.editingTextAnnotationId = nextId;
      },
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
      updatePropertiesBar: () => this.updatePropertiesBar(),
    });
  }

  private openTextPopupEditor(annotationId: string): void {
    openTextPopupEditor({
      annotationId,
      annotations: this.annotations,
      activeTextColor: this.activeTextColor,
      snapshotAnnotations: () => this.snapshotAnnotations(),
      setActiveTextColor: (color) => {
        this.activeTextColor = color;
      },
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
      updatePropertiesBar: () => this.updatePropertiesBar(),
    });
  }

  private applyImageSizeModeToSelected(): void {
    applyImageSizeModeToSelected({
      selectedAnnotation: this.selectedAnnotation,
      imageSizingMode: this.imageSizingMode,
      getImageSizeForMode: (originalWidth, originalHeight, mode) => this.getImageSizeForMode(originalWidth, originalHeight, mode),
      snapshotAnnotations: () => this.snapshotAnnotations(),
      renderAnnotations: () => this.renderAnnotations(),
      scheduleAutosave: () => this.scheduleAutosave(),
      updatePropertiesBar: () => this.updatePropertiesBar(),
    });
  }

  private scheduleAutosave(): void {
    scheduleAutosave({
      autosaveTimer: this.autosaveTimer,
      setAutosaveTimer: (timer) => {
        this.autosaveTimer = timer;
      },
      pdfData: this.pdfData,
      currentFilename: this.currentFilename,
      annotations: this.annotations,
    });
  }

  private setupKeyboardShortcuts(): void {
    setupKeyboardShortcuts(() => this.undo(), () => this.redo());
  }

  private async checkSessionRecovery(): Promise<void> {
    await checkSessionRecovery({
      onRestore: async (session) => {
        await this.loadPDF(session.pdfBytes, session.filename);
        this.annotations = session.annotations;
        this.renderAnnotations();
        toast.success('Session restored');
      },
    });
  }

  private openMergeModal(): void {
    openMergeModal(async (data) => {
      await this.loadPDF(data, 'merged.pdf');
    });
  }

  private async buildCurrentPDFBytes(): Promise<Uint8Array> {
    return buildCurrentPDFBytes({
      annotations: this.annotations,
      canvasScale: this.canvasScale,
    });
  }

  private async emailCurrentPDF(input: { to: string; subject?: string; body?: string }): Promise<EditorCommandResult> {
    return emailCurrentPDF({
      pdfData: this.pdfData,
      currentFilename: this.currentFilename,
      buildCurrentPDFBytes: () => this.buildCurrentPDFBytes(),
      input,
    });
  }

  private async savePDF(): Promise<void> {
    await savePDF({
      pdfData: this.pdfData,
      buildCurrentPDFBytes: () => this.buildCurrentPDFBytes(),
    });
  }
}

new PDFEditor();
