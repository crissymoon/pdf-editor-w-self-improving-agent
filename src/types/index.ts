export interface PDFDocument {
  id: string;
  name: string;
  data: ArrayBuffer;
  pageCount: number;
}

export interface Annotation {
  id: string;
  type: 'text' | 'image' | 'signature' | 'drawing' | 'highlight' | 'checkbox' | 'date';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string | ImageData | SignatureData;
  style?: AnnotationStyle;
}

export interface AnnotationStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
}

export interface SignatureData {
  imageData: string;
  timestamp: number;
  cryptoSignature?: CryptoSignature;
}

export interface CryptoSignature {
  publicKey: string;
  signature: string;
  algorithm: string;
  timestamp: number;
  hash: string;
}

export interface ImageData {
  src: string;
  originalWidth: number;
  originalHeight: number;
}

export interface Tool {
  id: string;
  name: string;
  icon: string;
  cursor?: string;
}

export interface AppState {
  currentPDF: PDFDocument | null;
  currentPage: number;
  zoom: number;
  activeTool: string | null;
  annotations: Annotation[];
  selectedAnnotation: Annotation | null;
  mergeQueue: PDFDocument[];
  cryptoKeyPair: CryptoKeyPair | null;
}

export interface MergeItem {
  id: string;
  file: File;
  name: string;
  pageCount?: number;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}
