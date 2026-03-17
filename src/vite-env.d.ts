/// <reference types="vite/client" />

interface XcmPdfEmailPayload {
	to: string;
	subject?: string;
	body?: string;
	filename?: string;
	pdfBytesBase64: string;
}

interface XcmPdfDesktopBridge {
	platform: string;
	versions: Record<string, string>;
	emailPDF?: (payload: XcmPdfEmailPayload) => Promise<{ ok: boolean; message: string }>;
}

interface Window {
	xcmPdfDesktop?: XcmPdfDesktopBridge;
}
