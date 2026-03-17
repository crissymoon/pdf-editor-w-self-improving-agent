import type { Annotation, ImageData as ImgData, SignatureData } from '../types';
import { icons } from '../utils/icons';
import { appendSanitizedHtml } from '../utils/safeHtml';

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface CreateAnnotationElementOptions {
  annotation: Annotation;
  canvasScale: number;
  zoom: number;
  selectedAnnotationId: string | null;
  activeTool: string | null;
  onToggleCheckbox: (annotation: Annotation) => void;
}

export function createAnnotationElement(options: CreateAnnotationElementOptions): HTMLElement {
  const { annotation, canvasScale, zoom, selectedAnnotationId, activeTool, onToggleCheckbox } = options;
  const element = document.createElement('div');
  element.className = `annotation annotation-${annotation.type}`;
  element.dataset.id = annotation.id;
  element.style.position = 'absolute';
  element.style.left = `${annotation.x * canvasScale * zoom}px`;
  element.style.top = `${annotation.y * canvasScale * zoom}px`;
  element.style.width = `${annotation.width * zoom}px`;
  element.style.height = `${annotation.height * zoom}px`;

  if (selectedAnnotationId === annotation.id) {
    element.style.outline = '2px solid var(--color-purple)';
    element.style.outlineOffset = '2px';
  }

  switch (annotation.type) {
    case 'text': {
      element.style.fontSize = `${(annotation.style?.fontSize || 14) * zoom}px`;
      element.style.color = annotation.style?.color || '#000';
      element.style.fontFamily = annotation.style?.fontFamily || 'Helvetica, Arial, sans-serif';
      element.style.whiteSpace = 'pre-wrap';
      element.style.width = 'auto';
      element.style.height = 'auto';
      if (activeTool === 'select') {
        element.style.cursor = 'text';
      }
      element.textContent = annotation.content as string;
      break;
    }

    case 'image':
    case 'signature': {
      const image = document.createElement('img');

      if (annotation.type === 'signature') {
        const signatureData = annotation.content as SignatureData;
        image.src = signatureData.imageData;

        if (signatureData.cryptoSignature) {
          element.style.borderBottom = '2px solid #10b981';
          element.title = 'Cryptographically signed';
        }
      } else {
        const imageData = annotation.content as ImgData;
        image.src = imageData.src;
      }

      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'contain';
      image.draggable = false;
      element.appendChild(image);

      if (annotation.type === 'image' && activeTool === 'select' && selectedAnnotationId === annotation.id) {
        const handles: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        for (const handle of handles) {
          const handleElement = document.createElement('button');
          handleElement.type = 'button';
          handleElement.className = `resize-handle resize-handle-${handle}`;
          handleElement.dataset.resizeHandle = handle;
          handleElement.title = 'Resize image';
          element.appendChild(handleElement);
        }
      }
      break;
    }

    case 'checkbox': {
      element.style.border = '1px solid #000';
      element.style.backgroundColor = '#fff';
      element.style.cursor = 'pointer';
      element.style.display = 'flex';
      element.style.alignItems = 'center';
      element.style.justifyContent = 'center';

      if (annotation.content === 'checked') {
        appendSanitizedHtml(element, icons.check);
        element.style.color = '#000';
      }

      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onToggleCheckbox(annotation);
      });
      break;
    }

    case 'date': {
      element.style.fontSize = `${(annotation.style?.fontSize || 12) * zoom}px`;
      element.style.color = annotation.style?.color || '#000';
      element.style.fontFamily = 'Helvetica, Arial, sans-serif';
      element.style.width = 'auto';
      element.textContent = annotation.content as string;
      break;
    }

    case 'highlight': {
      element.style.backgroundColor = annotation.style?.color || '#ffff00';
      element.style.opacity = String(annotation.style?.opacity ?? 0.3);
      break;
    }
  }

  return element;
}