import { textEditor } from '../components/TextEditor';
import type { Annotation } from '../types';
import { toast } from '../utils/toast';

type ImageSizingMode = 'auto' | 'regular';

interface UpdatePropertiesBarOptions {
  selectedAnnotation: Annotation | null;
  activeTool: string | null;
  activeHighlightColor: string;
  activeTextColor: string;
  imageSizingMode: ImageSizingMode;
}

interface ApplyColorOptions {
  color: string;
  selectedAnnotation: Annotation | null;
  activeTool: string | null;
  activeHighlightColor: string;
  activeTextColor: string;
  snapshotAnnotations: () => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
  updatePropertiesBar: () => void;
}

interface StartInlineTextEditOptions {
  annotationId: string;
  annotations: Annotation[];
  editingTextAnnotationId: string | null;
  snapshotAnnotations: () => void;
  setEditingTextAnnotationId: (annotationId: string | null) => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
  updatePropertiesBar: () => void;
}

interface OpenTextPopupEditorOptions {
  annotationId: string;
  annotations: Annotation[];
  activeTextColor: string;
  snapshotAnnotations: () => void;
  setActiveTextColor: (color: string) => void;
  renderAnnotations: () => void;
  scheduleAutosave: () => void;
  updatePropertiesBar: () => void;
}

export function updatePropertiesBar(options: UpdatePropertiesBarOptions): void {
  const { selectedAnnotation, activeTool, activeHighlightColor, activeTextColor, imageSizingMode } = options;
  const bar = document.getElementById('properties-bar');
  const label = document.getElementById('properties-bar-label');
  const swatchContainer = document.getElementById('properties-bar-swatches');
  const divider = document.getElementById('properties-bar-divider');
  const opacityWrap = document.getElementById('properties-bar-opacity-wrap') as HTMLElement | null;
  const imageControls = document.getElementById('properties-bar-image-controls') as HTMLElement | null;
  if (!bar || !label || !swatchContainer) return;

  const isHighlightContext = activeTool === 'highlight' || selectedAnnotation?.type === 'highlight';
  const isTextContext = activeTool === 'text' || selectedAnnotation?.type === 'text' || selectedAnnotation?.type === 'date';
  const isImageContext = activeTool === 'image' || selectedAnnotation?.type === 'image';

  const visible = isHighlightContext || isTextContext || isImageContext;
  bar.hidden = !visible;
  if (!visible) return;

  if (isImageContext) {
    label.textContent = 'Image sizing';
    swatchContainer.hidden = true;
    swatchContainer.replaceChildren();
    if (divider) divider.hidden = true;
    if (opacityWrap) opacityWrap.hidden = true;
    if (imageControls) {
      imageControls.hidden = false;
      imageControls.querySelectorAll<HTMLElement>('[data-image-size-mode]').forEach((button) => {
        button.classList.toggle('active', button.dataset.imageSizeMode === imageSizingMode);
      });
      const applyButton = imageControls.querySelector('#properties-bar-image-apply') as HTMLButtonElement | null;
      if (applyButton) {
        applyButton.hidden = selectedAnnotation?.type !== 'image';
      }
    }
    return;
  }

  swatchContainer.hidden = false;
  if (imageControls) imageControls.hidden = true;
  if (divider) divider.hidden = !isHighlightContext;

  const highlightSwatches = [
    { color: '#ffff00', label: 'Yellow' },
    { color: '#90ee90', label: 'Green' },
    { color: '#add8e6', label: 'Blue' },
    { color: '#ffb6c1', label: 'Pink' },
    { color: '#ffa500', label: 'Orange' },
    { color: '#dda0dd', label: 'Plum' },
    { color: '#ff6b6b', label: 'Coral' },
    { color: '#b0e0e6', label: 'Powder Blue' },
  ];
  const textSwatches = [
    { color: '#000000', label: 'Black' },
    { color: '#1f2937', label: 'Dark' },
    { color: '#4b5563', label: 'Gray' },
    { color: '#7c3aed', label: 'Purple' },
    { color: '#2563eb', label: 'Blue' },
    { color: '#059669', label: 'Green' },
    { color: '#dc2626', label: 'Red' },
    { color: '#d97706', label: 'Amber' },
  ];

  const swatches = isHighlightContext ? highlightSwatches : textSwatches;
  const activeColor = isHighlightContext
    ? (selectedAnnotation?.type === 'highlight' ? (selectedAnnotation.style?.color ?? activeHighlightColor) : activeHighlightColor)
    : (selectedAnnotation ? (selectedAnnotation.style?.color ?? activeTextColor) : activeTextColor);

  label.textContent = isHighlightContext ? 'Highlight color' : 'Text color';

  swatchContainer.replaceChildren();
  for (const swatch of swatches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `properties-bar-swatch${swatch.color === activeColor ? ' active' : ''}`;
    button.dataset.propColor = swatch.color;
    button.title = swatch.label;
    button.style.backgroundColor = swatch.color;
    swatchContainer.appendChild(button);
  }

  const customColorInput = document.createElement('input');
  customColorInput.type = 'color';
  customColorInput.id = 'properties-bar-custom-color';
  customColorInput.className = 'properties-bar-custom-color';
  customColorInput.value = activeColor;
  customColorInput.title = 'Custom color';
  swatchContainer.appendChild(customColorInput);

  if (opacityWrap) {
    const showOpacity = isHighlightContext;
    opacityWrap.hidden = !showOpacity;
    if (showOpacity && selectedAnnotation?.type === 'highlight') {
      const opacityInput = document.getElementById('properties-bar-opacity') as HTMLInputElement | null;
      const opacityValue = document.getElementById('properties-bar-opacity-val');
      const percent = Math.round((selectedAnnotation.style?.opacity ?? 0.3) * 100);
      if (opacityInput) opacityInput.value = String(percent);
      if (opacityValue) opacityValue.textContent = `${percent}%`;
    }
  }
}

export function applyColorFromPropertiesBar(options: ApplyColorOptions): { activeHighlightColor: string; activeTextColor: string } {
  const {
    color,
    selectedAnnotation,
    activeTool,
    activeHighlightColor,
    activeTextColor,
    snapshotAnnotations,
    renderAnnotations,
    scheduleAutosave,
    updatePropertiesBar,
  } = options;

  if (selectedAnnotation?.type === 'highlight' || selectedAnnotation?.type === 'text' || selectedAnnotation?.type === 'date') {
    snapshotAnnotations();
    selectedAnnotation.style = { ...selectedAnnotation.style, color };
    renderAnnotations();
    scheduleAutosave();
  }

  const nextHighlightColor = activeTool === 'highlight' || selectedAnnotation?.type === 'highlight'
    ? color
    : activeHighlightColor;
  const nextTextColor = activeTool === 'text' || selectedAnnotation?.type === 'text' || selectedAnnotation?.type === 'date'
    ? color
    : activeTextColor;

  updatePropertiesBar();
  return {
    activeHighlightColor: nextHighlightColor,
    activeTextColor: nextTextColor,
  };
}

export function startInlineTextEdit(options: StartInlineTextEditOptions): void {
  const {
    annotationId,
    annotations,
    editingTextAnnotationId,
    snapshotAnnotations,
    setEditingTextAnnotationId,
    renderAnnotations,
    scheduleAutosave,
    updatePropertiesBar,
  } = options;
  if (editingTextAnnotationId === annotationId) {
    return;
  }

  const annotation = annotations.find((item) => item.id === annotationId && item.type === 'text');
  if (!annotation) return;

  const element = document.querySelector(`.annotation[data-id="${annotationId}"]`) as HTMLElement | null;
  if (!element) return;

  snapshotAnnotations();
  setEditingTextAnnotationId(annotationId);

  const initialValue = String(annotation.content || '');
  element.contentEditable = 'true';
  element.classList.add('annotation-text-editing');
  element.focus();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const finish = (save: boolean): void => {
    const nextValue = element.textContent?.trim() ?? '';
    element.contentEditable = 'false';
    element.classList.remove('annotation-text-editing');
    element.removeEventListener('blur', onBlur);
    element.removeEventListener('keydown', onKeyDown);
    setEditingTextAnnotationId(null);

    if (!save) {
      annotation.content = initialValue;
    } else {
      annotation.content = nextValue || initialValue;
    }
    renderAnnotations();
    scheduleAutosave();
    updatePropertiesBar();
  };

  const onBlur = (): void => finish(true);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    }
  };

  element.addEventListener('blur', onBlur);
  element.addEventListener('keydown', onKeyDown);
}

export function openTextPopupEditor(options: OpenTextPopupEditorOptions): void {
  const {
    annotationId,
    annotations,
    activeTextColor,
    snapshotAnnotations,
    setActiveTextColor,
    renderAnnotations,
    scheduleAutosave,
    updatePropertiesBar,
  } = options;
  const annotation = annotations.find((item) => item.id === annotationId && item.type === 'text');
  if (!annotation) return;

  const currentText = String(annotation.content || '');
  const currentColor = annotation.style?.color || activeTextColor;
  textEditor.open((editorOptions) => {
    snapshotAnnotations();
    setActiveTextColor(editorOptions.color);
    annotation.content = editorOptions.text;
    annotation.style = {
      ...annotation.style,
      fontSize: editorOptions.fontSize,
      fontFamily: editorOptions.fontFamily,
      color: editorOptions.color,
    };
    annotation.height = editorOptions.fontSize + 4;
    renderAnnotations();
    scheduleAutosave();
    updatePropertiesBar();
    toast.success('Text updated');
  }, currentColor, currentText);
}