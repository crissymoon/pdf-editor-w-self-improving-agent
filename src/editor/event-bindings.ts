import type { Annotation } from '../types';

type ImageSizingMode = 'auto' | 'regular';

interface SetupEditorEventListenersOptions {
  createNewPDF: () => void | Promise<void>;
  openFilePicker: () => void;
  openMergeModal: () => void;
  savePDF: () => void | Promise<void>;
  handleFileInput: (event: Event) => void;
  loadPDFFile: (file: File) => void | Promise<void>;
  setActiveTool: (tool: string | null) => void;
  deleteSelectedAnnotation: () => void;
  undo: () => void;
  redo: () => void;
  setImageSizingMode: (mode: ImageSizingMode) => void;
  updatePropertiesBar: () => void;
  applyImageSizeModeToSelected: () => void;
  applyColorFromPropertiesBar: (color: string) => void;
  getSelectedAnnotation: () => Annotation | null;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getCurrentPage: () => number;
  goToPage: (page: number) => void | Promise<void>;
  handleCanvasClick: (event: MouseEvent) => void;
  handleMouseDown: (event: PointerEvent) => void;
  handleMouseMove: (event: PointerEvent) => void;
  handleMouseUp: (event: PointerEvent) => void;
}

export function setupEditorEventListeners(options: SetupEditorEventListenersOptions): void {
  document.getElementById('btn-new')?.addEventListener('click', () => options.createNewPDF());
  document.getElementById('btn-open')?.addEventListener('click', () => options.openFilePicker());
  document.getElementById('btn-merge')?.addEventListener('click', () => options.openMergeModal());
  document.getElementById('btn-save')?.addEventListener('click', () => options.savePDF());

  document.getElementById('drop-zone')?.addEventListener('click', () => options.openFilePicker());
  document.getElementById('file-input')?.addEventListener('change', (event) => options.handleFileInput(event));

  const dropZone = document.getElementById('drop-zone');
  const canvasWrapper = document.getElementById('canvas-wrapper');

  [dropZone, canvasWrapper].forEach((element) => {
    element?.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone?.classList.add('dragover');
    });

    element?.addEventListener('dragleave', () => {
      dropZone?.classList.remove('dragover');
    });

    element?.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone?.classList.remove('dragover');
      const files = (event as DragEvent).dataTransfer?.files;
      if (files?.[0]) {
        void options.loadPDFFile(files[0]);
      }
    });
  });

  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      options.setActiveTool(button.getAttribute('data-tool'));
    });
  });

  document.getElementById('btn-delete')?.addEventListener('click', () => options.deleteSelectedAnnotation());
  document.getElementById('btn-undo')?.addEventListener('click', () => options.undo());
  document.getElementById('btn-redo')?.addEventListener('click', () => options.redo());

  document.getElementById('properties-bar')?.addEventListener('click', (event) => {
    const modeButton = (event.target as HTMLElement).closest('[data-image-size-mode]') as HTMLElement | null;
    if (modeButton) {
      options.setImageSizingMode((modeButton.dataset.imageSizeMode as ImageSizingMode) ?? 'auto');
      options.updatePropertiesBar();
      return;
    }

    const applyImageButton = (event.target as HTMLElement).closest('#properties-bar-image-apply');
    if (applyImageButton) {
      options.applyImageSizeModeToSelected();
      return;
    }

    const swatch = (event.target as HTMLElement).closest('[data-prop-color]') as HTMLElement | null;
    if (swatch?.dataset.propColor) {
      options.applyColorFromPropertiesBar(swatch.dataset.propColor);
    }
  });

  document.getElementById('properties-bar-opacity')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    const valueLabel = document.getElementById('properties-bar-opacity-val');
    if (valueLabel) valueLabel.textContent = `${value}%`;

    const selectedAnnotation = options.getSelectedAnnotation();
    if (selectedAnnotation?.type === 'highlight') {
      selectedAnnotation.style = { ...selectedAnnotation.style, opacity: value / 100 };
      options.renderAnnotations();
      options.scheduleAutosave();
    }
  });

  document.getElementById('properties-bar')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'properties-bar-custom-color') {
      options.applyColorFromPropertiesBar(input.value);
    }
  });

  document.getElementById('btn-zoom-in')?.addEventListener('click', () => options.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => options.zoomOut());

  document.getElementById('btn-prev-page')?.addEventListener('click', () => options.goToPage(options.getCurrentPage() - 1));
  document.getElementById('btn-next-page')?.addEventListener('click', () => options.goToPage(options.getCurrentPage() + 1));
  document.getElementById('page-input')?.addEventListener('change', (event) => {
    const page = parseInt((event.target as HTMLInputElement).value, 10);
    void options.goToPage(page);
  });

  const annotationLayer = document.getElementById('annotation-layer');
  annotationLayer?.addEventListener('click', (event) => options.handleCanvasClick(event));
  annotationLayer?.addEventListener('pointerdown', (event) => options.handleMouseDown(event));
  annotationLayer?.addEventListener('pointermove', (event) => options.handleMouseMove(event));
  annotationLayer?.addEventListener('pointerup', (event) => options.handleMouseUp(event));
  annotationLayer?.addEventListener('pointercancel', (event) => options.handleMouseUp(event));
  annotationLayer?.addEventListener('pointerleave', (event) => options.handleMouseUp(event));
}