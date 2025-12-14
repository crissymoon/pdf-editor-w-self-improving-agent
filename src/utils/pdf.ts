import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation, SignatureData, ImageData as ImgData } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export class PDFService {
  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private originalData: ArrayBuffer | null = null;

  async loadPDF(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
    this.originalData = data.slice(0);
    this.pdfDoc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
    return this.pdfDoc;
  }

  async getPageCount(): Promise<number> {
    return this.pdfDoc?.numPages || 0;
  }

  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.5
  ): Promise<{ width: number; height: number }> {
    if (!this.pdfDoc) throw new Error('No PDF loaded');

    const page = await this.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const context = canvas.getContext('2d')!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render as any)({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    return { width: viewport.width, height: viewport.height };
  }

  async renderThumbnail(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    maxWidth: number = 200
  ): Promise<void> {
    if (!this.pdfDoc) throw new Error('No PDF loaded');

    const page = await this.pdfDoc.getPage(pageNumber);
    const originalViewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / originalViewport.width;
    const viewport = page.getViewport({ scale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const context = canvas.getContext('2d')!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render as any)({
      canvasContext: context,
      viewport: viewport,
    }).promise;
  }

  async applyAnnotationsAndSave(annotations: Annotation[]): Promise<Uint8Array> {
    if (!this.originalData) throw new Error('No PDF loaded');

    const pdfDoc = await PDFDocument.load(this.originalData.slice(0));
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const annotation of annotations) {
      const page = pages[annotation.pageIndex];
      if (!page) continue;

      const { height: pageHeight } = page.getSize();

      switch (annotation.type) {
        case 'text': {
          const fontSize = annotation.style?.fontSize || 14;
          const color = this.hexToRgb(annotation.style?.color || '#000000');

          page.drawText(annotation.content as string, {
            x: annotation.x,
            y: pageHeight - annotation.y - fontSize,
            size: fontSize,
            font: helveticaFont,
            color: rgb(color.r / 255, color.g / 255, color.b / 255),
          });
          break;
        }

        case 'image':
        case 'signature': {
          let imageData: string;

          if (annotation.type === 'signature') {
            const sigData = annotation.content as SignatureData;
            imageData = sigData.imageData;
          } else {
            const imgData = annotation.content as ImgData;
            imageData = imgData.src;
          }

          if (imageData.startsWith('data:image/png')) {
            const base64 = imageData.split(',')[1];
            const imageBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const image = await pdfDoc.embedPng(imageBytes);

            page.drawImage(image, {
              x: annotation.x,
              y: pageHeight - annotation.y - annotation.height,
              width: annotation.width,
              height: annotation.height,
            });
          } else if (imageData.startsWith('data:image/jpeg') || imageData.startsWith('data:image/jpg')) {
            const base64 = imageData.split(',')[1];
            const imageBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const image = await pdfDoc.embedJpg(imageBytes);

            page.drawImage(image, {
              x: annotation.x,
              y: pageHeight - annotation.y - annotation.height,
              width: annotation.width,
              height: annotation.height,
            });
          }
          break;
        }

        case 'checkbox': {
          const isChecked = annotation.content === 'checked';
          const size = Math.min(annotation.width, annotation.height);

          page.drawRectangle({
            x: annotation.x,
            y: pageHeight - annotation.y - size,
            width: size,
            height: size,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
          });

          if (isChecked) {
            page.drawText('X', {
              x: annotation.x + 2,
              y: pageHeight - annotation.y - size + 2,
              size: size - 4,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
          }
          break;
        }

        case 'date': {
          const fontSize = annotation.style?.fontSize || 12;
          const color = this.hexToRgb(annotation.style?.color || '#000000');

          page.drawText(annotation.content as string, {
            x: annotation.x,
            y: pageHeight - annotation.y - fontSize,
            size: fontSize,
            font: helveticaFont,
            color: rgb(color.r / 255, color.g / 255, color.b / 255),
          });
          break;
        }

        case 'highlight': {
          const color = this.hexToRgb(annotation.style?.color || '#ffff00');

          page.drawRectangle({
            x: annotation.x,
            y: pageHeight - annotation.y - annotation.height,
            width: annotation.width,
            height: annotation.height,
            color: rgb(color.r / 255, color.g / 255, color.b / 255),
            opacity: 0.3,
          });
          break;
        }
      }
    }

    return await pdfDoc.save();
  }

  async mergePDFs(pdfDataArray: ArrayBuffer[]): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create();

    for (const pdfData of pdfDataArray) {
      const pdf = await PDFDocument.load(pdfData);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    return await mergedPdf.save();
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  destroy(): void {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
    this.originalData = null;
  }
}

export const pdfService = new PDFService();
