import type { Annotation } from '../types';

type ImageSizingMode = 'auto' | 'regular';

interface SetupEditorEventListenersOptions {
  createNewPDF: () => void | Promise<void>;
  openFilePicker: () => void;
  openMergeModal: () => void;
  savePDF: () => void | Promise<void>;
  toggleSidebarPanel: () => void;
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
  document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => options.toggleSidebarPanel());

  const overflowToggle = document.getElementById('btn-overflow-menu');
  const overflowMenu = document.getElementById('topbar-overflow-menu');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const contextMenu = document.getElementById('editor-context-menu');

  const closeOverflowMenu = () => {
    overflowMenu?.setAttribute('hidden', '');
    if (overflowMenu) {
      overflowMenu.style.left = '';
      overflowMenu.style.top = '';
    }
    overflowToggle?.setAttribute('aria-expanded', 'false');
  };

  const isClickInsideOverflow = (target: EventTarget | null): boolean => {
    const node = target as Node | null;
    if (!node) {
      return false;
    }

    return Boolean(overflowToggle?.contains(node) || overflowMenu?.contains(node));
  };

  const isActionDisabled = (action: string): boolean => {
    if (action === 'delete') {
      return document.getElementById('btn-delete')?.hasAttribute('disabled') ?? true;
    }
    if (action === 'undo') {
      return document.getElementById('btn-undo')?.hasAttribute('disabled') ?? true;
    }
    if (action === 'redo') {
      return document.getElementById('btn-redo')?.hasAttribute('disabled') ?? true;
    }
    if (action === 'save') {
      return document.getElementById('btn-save')?.hasAttribute('disabled') ?? true;
    }
    return false;
  };

  const syncMenuState = (selector: string, attrName: string) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((item) => {
      const action = item.dataset[attrName];
      if (!action) return;

      const disabled = isActionDisabled(action);
      item.classList.toggle('is-disabled', disabled);
      item.setAttribute('aria-disabled', String(disabled));
    });
  };

  const executeQuickAction = (action: string) => {
    if (isActionDisabled(action)) {
      return;
    }

    if (action === 'new') options.createNewPDF();
    if (action === 'open') options.openFilePicker();
    if (action === 'merge') options.openMergeModal();
    if (action === 'save') options.savePDF();
    if (action === 'delete') options.deleteSelectedAnnotation();
    if (action === 'undo') options.undo();
    if (action === 'redo') options.redo();
    if (action === 'toggle-sidebar') options.toggleSidebarPanel();
  };

  const openOverflowMenu = () => {
    if (!overflowMenu || !overflowToggle) {
      return;
    }

    syncMenuState('[data-overflow-action]', 'overflowAction');

    const toggleRect = overflowToggle.getBoundingClientRect();
    const preferredLeft = Math.max(8, toggleRect.left);
    const menuWidth = 220;
    const boundedLeft = Math.min(preferredLeft, window.innerWidth - menuWidth - 8);
    const menuTop = Math.min(toggleRect.bottom + 6, window.innerHeight - 16);

    overflowMenu.style.left = `${boundedLeft}px`;
    overflowMenu.style.top = `${menuTop}px`;
    overflowMenu.removeAttribute('hidden');
    overflowToggle.setAttribute('aria-expanded', 'true');
  };

  overflowToggle?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!overflowMenu || !overflowToggle) {
      return;
    }

    const isOpen = !overflowMenu.hasAttribute('hidden');
    if (isOpen) {
      closeOverflowMenu();
      return;
    }

    openOverflowMenu();
  });

  overflowToggle?.addEventListener('click', (event) => {
    event.preventDefault();
  });

  overflowMenu?.addEventListener('click', (event) => {
    event.stopPropagation();
    const item = (event.target as HTMLElement).closest('[data-overflow-action]') as HTMLElement | null;
    if (!item?.dataset.overflowAction) {
      return;
    }

    const action = item.dataset.overflowAction;
    executeQuickAction(action);
    closeOverflowMenu();
  });

  sidebarBackdrop?.addEventListener('click', () => options.toggleSidebarPanel());

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

  const canvasWrapperEl = document.getElementById('canvas-wrapper');
  canvasWrapperEl?.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!contextMenu) {
      return;
    }

    syncMenuState('[data-context-action]', 'contextAction');

    const menuWidth = 200;
    const menuHeight = 180;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    const x = Math.min(event.clientX, maxX);
    const y = Math.min(event.clientY, maxY);

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.removeAttribute('hidden');
  });

  contextMenu?.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest('[data-context-action]') as HTMLElement | null;
    if (!item?.dataset.contextAction) {
      return;
    }

    const action = item.dataset.contextAction;
    executeQuickAction(action);
    contextMenu.setAttribute('hidden', '');
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isClickInsideOverflow(event.target)) {
      closeOverflowMenu();
    }
  });

  document.addEventListener('click', (event) => {
    if (!(contextMenu?.contains(event.target as Node))) {
      contextMenu?.setAttribute('hidden', '');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeOverflowMenu();
      contextMenu?.setAttribute('hidden', '');
    }
  });
}