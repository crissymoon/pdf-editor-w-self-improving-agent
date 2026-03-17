import type { EditorCommandResult } from '../agent/shared/types';
import { mergeModal } from '../components/MergeModal';
import type { Annotation, ImageData as ImgData } from '../types';
import { pdfService } from '../utils/pdf';
import { sessionVault } from '../utils/session-vault';
import { toast } from '../utils/toast';

type ImageSizingMode = 'auto' | 'regular';
type RecoveredSession = NonNullable<Awaited<ReturnType<typeof sessionVault.recover>>>;

interface ApplyImageSizeModeOptions {
  selectedAnnotation: Annotation | null;
  imageSizingMode: ImageSizingMode;
  getImageSizeForMode: (originalWidth: number, originalHeight: number, mode: ImageSizingMode) => { width: number; height: number };
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
  updatePropertiesBar: () => void;
}

interface ScheduleAutosaveOptions {
  autosaveTimer: number | null;
  setAutosaveTimer: (timer: number | null) => void;
  pdfData: ArrayBuffer | null;
  currentFilename: string;
  annotations: Annotation[];
}

interface CheckSessionRecoveryOptions {
  onRestore: (session: RecoveredSession) => Promise<void> | void;
}

interface BuildCurrentPDFBytesOptions {
  annotations: Annotation[];
  canvasScale: number;
}

interface EmailCurrentPDFOptions {
  pdfData: ArrayBuffer | null;
  currentFilename: string;
  buildCurrentPDFBytes: () => Promise<Uint8Array>;
  input: { to: string; subject?: string; body?: string };
}

interface SavePDFOptions {
  pdfData: ArrayBuffer | null;
  buildCurrentPDFBytes: () => Promise<Uint8Array>;
}

export function applyImageSizeModeToSelected(options: ApplyImageSizeModeOptions): void {
  const {
    selectedAnnotation,
    imageSizingMode,
    getImageSizeForMode,
    snapshotAnnotations,
    renderAnnotations,
    scheduleAutosave,
    updatePropertiesBar,
  } = options;
  if (!selectedAnnotation || selectedAnnotation.type !== 'image') return;

  const imageData = selectedAnnotation.content as ImgData;
  const nextSize = getImageSizeForMode(imageData.originalWidth, imageData.originalHeight, imageSizingMode);

  snapshotAnnotations();
  selectedAnnotation.width = nextSize.width;
  selectedAnnotation.height = nextSize.height;
  renderAnnotations();
  scheduleAutosave();
  updatePropertiesBar();
  toast.success(imageSizingMode === 'auto' ? 'Auto size applied' : 'Regular size applied');
}

export function scheduleAutosave(options: ScheduleAutosaveOptions): void {
  const { autosaveTimer, setAutosaveTimer, pdfData, currentFilename, annotations } = options;
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
  }

  const timer = window.setTimeout(() => {
    setAutosaveTimer(null);
    if (pdfData) {
      void sessionVault.save(currentFilename, pdfData, annotations);
    }
  }, 2000);
  setAutosaveTimer(timer);
}

export function setupKeyboardShortcuts(undo: () => void, redo: () => void): void {
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.ctrlKey && !event.shiftKey && event.key === 'z') {
      event.preventDefault();
      undo();
    } else if ((event.ctrlKey && event.shiftKey && event.key === 'Z') || (event.ctrlKey && event.key === 'y')) {
      event.preventDefault();
      redo();
    }
  });
}

export async function checkSessionRecovery(options: CheckSessionRecoveryOptions): Promise<void> {
  const session = await sessionVault.recover();
  if (!session) return;

  const bar = document.createElement('div');
  bar.className = 'recovery-bar';

  const message = document.createElement('span');
  message.className = 'recovery-bar-msg';
  message.append('Unsaved session found: ');

  const filename = document.createElement('strong');
  filename.textContent = session.filename;
  message.appendChild(filename);
  message.append(` (${new Date(session.timestamp).toLocaleTimeString()})`);

  const restoreButton = document.createElement('button');
  restoreButton.className = 'recovery-bar-btn recovery-bar-btn--restore';
  restoreButton.type = 'button';
  restoreButton.textContent = 'Restore';

  const dismissButton = document.createElement('button');
  dismissButton.className = 'recovery-bar-btn recovery-bar-btn--dismiss';
  dismissButton.type = 'button';
  dismissButton.textContent = 'Dismiss';

  bar.append(message, restoreButton, dismissButton);
  document.body.prepend(bar);

  restoreButton.addEventListener('click', async () => {
    bar.remove();
    await options.onRestore(session);
  });

  dismissButton.addEventListener('click', () => {
    bar.remove();
    void sessionVault.clear();
  });
}

export function openMergeModal(onMerge: (data: ArrayBuffer) => Promise<void> | void): void {
  mergeModal.open(async (data: ArrayBuffer) => {
    await onMerge(data);
  });
}

export async function buildCurrentPDFBytes(options: BuildCurrentPDFBytesOptions): Promise<Uint8Array> {
  const { annotations, canvasScale } = options;
  const scaleRatio = 1 / canvasScale;
  const scaledAnnotations = annotations.map((annotation) => ({
    ...annotation,
    x: annotation.x * scaleRatio * canvasScale,
    y: annotation.y * scaleRatio * canvasScale,
    width: annotation.width * scaleRatio,
    height: annotation.height * scaleRatio,
  }));
  return pdfService.applyAnnotationsAndSave(scaledAnnotations);
}

export async function emailCurrentPDF(options: EmailCurrentPDFOptions): Promise<EditorCommandResult> {
  const { pdfData, currentFilename, buildCurrentPDFBytes, input } = options;
  if (!pdfData) {
    return { ok: false, message: 'No PDF loaded' };
  }
  if (!input.to) {
    return { ok: false, message: 'Recipient email is required (to).' };
  }

  const bridge = window.xcmPdfDesktop;
  if (!bridge?.emailPDF) {
    return {
      ok: false,
      message: 'Desktop email bridge is unavailable. Run in Electron with preload enabled.',
    };
  }

  try {
    toast.info('Preparing PDF for email...');
    const pdfBytes = await buildCurrentPDFBytes();
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    const response = await bridge.emailPDF({
      to: input.to,
      subject: input.subject || `XCM-PDF: ${currentFilename || 'document'}`,
      body: input.body || 'Attached is your PDF from XCM-PDF.',
      filename: currentFilename || 'xcm-pdf-edited.pdf',
      pdfBytesBase64: base64,
    });

    if (!response?.ok) {
      const message = response?.message || 'Email send failed';
      toast.error(message);
      return { ok: false, message };
    }

    toast.success('Email request completed');
    return { ok: true, message: response.message || 'Email sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    toast.error(message);
    return { ok: false, message };
  }
}

export async function savePDF(options: SavePDFOptions): Promise<void> {
  const { pdfData, buildCurrentPDFBytes } = options;
  if (!pdfData) {
    toast.error('No PDF loaded');
    return;
  }

  try {
    toast.info('Saving PDF...');

    const pdfBytes = await buildCurrentPDFBytes();
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'xcm-pdf-edited.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    toast.success('PDF saved successfully');
  } catch (error) {
    console.error('Save error:', error);
    toast.error('Failed to save PDF');
  }
}