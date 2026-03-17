import { signaturePad } from '../components/SignaturePad';
import { textEditor } from '../components/TextEditor';
import type { Annotation, ImageData as ImgData, SignatureData } from '../types';
import { toast } from '../utils/toast';

type ImageSizingMode = 'auto' | 'regular';

interface HandleCanvasClickOptions {
  event: MouseEvent;
  activeTool: string | null;
  zoom: number;
  selectAnnotationAt: (event: MouseEvent) => void;
  addTextAnnotation: (x: number, y: number) => void;
  addImageAnnotation: (x: number, y: number) => void;
  addSignatureAnnotation: (x: number, y: number) => void;
  addCheckboxAnnotation: (x: number, y: number) => void;
  addDateAnnotation: (x: number, y: number) => void;
}

interface AnnotationMutationOptions {
  annotation: Annotation;
  annotations: Annotation[];
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
  updatePropertiesBar?: () => void;
  successMessage: string;
}

interface AddTextAnnotationOptions {
  x: number;
  y: number;
  currentPage: number;
  canvasScale: number;
  activeTextColor: string;
  setActiveTextColor: (color: string) => void;
  annotations: Annotation[];
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
  updatePropertiesBar: () => void;
}

interface AddImageAnnotationOptions {
  x: number;
  y: number;
  currentPage: number;
  canvasScale: number;
  imageSizingMode: ImageSizingMode;
  annotations: Annotation[];
  getImageSizeForMode: (originalWidth: number, originalHeight: number, mode: ImageSizingMode) => { width: number; height: number };
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
}

interface AddSignatureAnnotationOptions {
  x: number;
  y: number;
  currentPage: number;
  canvasScale: number;
  annotations: Annotation[];
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
}

interface AddCheckboxAnnotationOptions {
  x: number;
  y: number;
  currentPage: number;
  canvasScale: number;
  annotations: Annotation[];
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
}

interface AddDateAnnotationOptions {
  x: number;
  y: number;
  currentPage: number;
  canvasScale: number;
  annotations: Annotation[];
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
}

function commitAnnotation(options: AnnotationMutationOptions): void {
  const {
    annotation,
    annotations,
    snapshotAnnotations,
    renderAnnotations,
    scheduleAutosave,
    updatePropertiesBar,
    successMessage,
  } = options;
  snapshotAnnotations();
  annotations.push(annotation);
  renderAnnotations();
  scheduleAutosave();
  updatePropertiesBar?.();
  toast.success(successMessage);
}

export function handleCanvasClick(options: HandleCanvasClickOptions): void {
  const { event, activeTool, zoom } = options;
  if (activeTool === 'highlight') return;

  if (!activeTool || activeTool === 'select') {
    options.selectAnnotationAt(event);
    return;
  }

  const rect = (event.target as HTMLElement).getBoundingClientRect();
  const x = (event.clientX - rect.left) / zoom;
  const y = (event.clientY - rect.top) / zoom;

  switch (activeTool) {
    case 'text':
      options.addTextAnnotation(x, y);
      break;
    case 'image':
      options.addImageAnnotation(x, y);
      break;
    case 'signature':
      options.addSignatureAnnotation(x, y);
      break;
    case 'checkbox':
      options.addCheckboxAnnotation(x, y);
      break;
    case 'date':
      options.addDateAnnotation(x, y);
      break;
  }
}

export function addTextAnnotation(options: AddTextAnnotationOptions): void {
  textEditor.open((editorOptions) => {
    options.setActiveTextColor(editorOptions.color);
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: 'text',
      pageIndex: options.currentPage - 1,
      x: options.x / options.canvasScale,
      y: options.y / options.canvasScale,
      width: 200,
      height: editorOptions.fontSize + 4,
      content: editorOptions.text,
      style: {
        fontSize: editorOptions.fontSize,
        fontFamily: editorOptions.fontFamily,
        color: editorOptions.color,
      },
    };

    commitAnnotation({
      annotation,
      annotations: options.annotations,
      snapshotAnnotations: options.snapshotAnnotations,
      renderAnnotations: options.renderAnnotations,
      scheduleAutosave: options.scheduleAutosave,
      updatePropertiesBar: options.updatePropertiesBar,
      successMessage: 'Text added',
    });
  }, options.activeTextColor, '');
}

export function addImageAnnotation(options: AddImageAnnotationOptions): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => {
        const imageSize = options.getImageSizeForMode(image.width, image.height, options.imageSizingMode);

        const imageData: ImgData = {
          src: event.target?.result as string,
          originalWidth: image.width,
          originalHeight: image.height,
        };

        const annotation: Annotation = {
          id: crypto.randomUUID(),
          type: 'image',
          pageIndex: options.currentPage - 1,
          x: options.x / options.canvasScale,
          y: options.y / options.canvasScale,
          width: imageSize.width,
          height: imageSize.height,
          content: imageData,
        };

        commitAnnotation({
          annotation,
          annotations: options.annotations,
          snapshotAnnotations: options.snapshotAnnotations,
          renderAnnotations: options.renderAnnotations,
          scheduleAutosave: options.scheduleAutosave,
          successMessage: 'Image added',
        });
      };
      image.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

  input.click();
}

export function addSignatureAnnotation(options: AddSignatureAnnotationOptions): void {
  signaturePad.open((signature: SignatureData) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 200;
      let width = image.width;
      let height = image.height;

      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width *= ratio;
        height *= ratio;
      }

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'signature',
        pageIndex: options.currentPage - 1,
        x: options.x / options.canvasScale,
        y: options.y / options.canvasScale,
        width,
        height,
        content: signature,
      };

      commitAnnotation({
        annotation,
        annotations: options.annotations,
        snapshotAnnotations: options.snapshotAnnotations,
        renderAnnotations: options.renderAnnotations,
        scheduleAutosave: options.scheduleAutosave,
        successMessage: signature.cryptoSignature ? 'Cryptographic signature added' : 'Signature added',
      });
    };
    image.src = signature.imageData;
  });
}

export function addCheckboxAnnotation(options: AddCheckboxAnnotationOptions): void {
  const annotation: Annotation = {
    id: crypto.randomUUID(),
    type: 'checkbox',
    pageIndex: options.currentPage - 1,
    x: options.x / options.canvasScale,
    y: options.y / options.canvasScale,
    width: 20,
    height: 20,
    content: 'unchecked',
  };

  commitAnnotation({
    annotation,
    annotations: options.annotations,
    snapshotAnnotations: options.snapshotAnnotations,
    renderAnnotations: options.renderAnnotations,
    scheduleAutosave: options.scheduleAutosave,
    successMessage: 'Checkbox added',
  });
}

export function addDateAnnotation(options: AddDateAnnotationOptions): void {
  const dateLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const annotation: Annotation = {
    id: crypto.randomUUID(),
    type: 'date',
    pageIndex: options.currentPage - 1,
    x: options.x / options.canvasScale,
    y: options.y / options.canvasScale,
    width: 150,
    height: 20,
    content: dateLabel,
    style: {
      fontSize: 12,
      color: '#000000',
    },
  };

  commitAnnotation({
    annotation,
    annotations: options.annotations,
    snapshotAnnotations: options.snapshotAnnotations,
    renderAnnotations: options.renderAnnotations,
    scheduleAutosave: options.scheduleAutosave,
    successMessage: 'Date added',
  });
}