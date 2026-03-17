export function loadPdfDocument(filePath: string): Promise<string> {
  return Promise.resolve(`loaded:${filePath}`);
}

export function savePdfDocument(outputPath: string): Promise<string> {
  return Promise.resolve(`saved:${outputPath}`);
}

export function renderPage(pageIndex: number): string {
  return `render-page-${pageIndex}`;
}

export const editorStatus = "idle";
