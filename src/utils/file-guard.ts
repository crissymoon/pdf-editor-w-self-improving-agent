/**
 * File guard module.
 *
 * Validates uploaded files before they are loaded into the editor.
 * Performs:
 *   - File size limit enforcement (50 MB ceiling)
 *   - Filename safety check (path traversal, null bytes, forbidden chars)
 *   - PDF magic byte verification (%PDF header)
 *   - Heuristic binary scan for known suspicious PDF constructs
 *
 * This is a client-side structural check. It is not a full antivirus scanner
 * but it blocks well-known attack patterns and malformed inputs.
 */

export interface FileGuardViolation {
  severity: 'block' | 'warn';
  code: string;
  message: string;
}

export interface FileGuardResult {
  ok: boolean;
  violations: FileGuardViolation[];
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// Characters and patterns that must not appear in filenames.
// Path traversal sequences (.. combinations) and null bytes are especially dangerous.
const UNSAFE_FILENAME_RE = /[/\\:*?"<>|]|\.\.|%2e%2e|\x00/i;

// PDF starts with the magic bytes: %PDF (0x25 0x50 0x44 0x46)
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] as const;

interface SuspiciousPattern {
  code: string;
  label: string;
  severity: 'block' | 'warn';
  token: string;
}

// Tokens searched as latin-1 decoded text within the raw file bytes.
// These are standard PDF dictionary names used in attack payloads.
// False positives are possible on highly unusual but legitimate PDFs;
// warn-severity patterns will notify without blocking.
const SUSPICIOUS_PDF_PATTERNS: SuspiciousPattern[] = [
  { code: 'PDF_JAVASCRIPT', label: '/JavaScript action',    severity: 'block', token: '/JavaScript' },
  { code: 'PDF_LAUNCH',     label: '/Launch action',        severity: 'block', token: '/Launch'     },
  { code: 'PDF_RICHMEDIA',  label: '/RichMedia annotation', severity: 'warn',  token: '/RichMedia'  },
  { code: 'PDF_XFA',        label: '/XFA form',             severity: 'warn',  token: '/XFA'        },
  { code: 'PDF_JBIG2',      label: '/JBIG2Decode filter',   severity: 'warn',  token: '/JBIG2Decode'},
];

function hasPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === PDF_MAGIC[0] &&
    bytes[1] === PDF_MAGIC[1] &&
    bytes[2] === PDF_MAGIC[2] &&
    bytes[3] === PDF_MAGIC[3]
  );
}

function scanContent(bytes: Uint8Array): FileGuardViolation[] {
  const violations: FileGuardViolation[] = [];

  // Decode as latin-1: each byte maps 1-to-1 to a code point,
  // so all byte values are preserved for substring matching.
  // PDF structure tokens are pure ASCII; binary object streams
  // will not accidentally match these specific named tokens.
  let decoded: string;
  try {
    decoded = new TextDecoder('latin1').decode(bytes);
  } catch {
    return violations;
  }

  for (const pattern of SUSPICIOUS_PDF_PATTERNS) {
    if (decoded.includes(pattern.token)) {
      violations.push({
        severity: pattern.severity,
        code: pattern.code,
        message: `Suspicious PDF construct detected: ${pattern.label}`,
      });
    }
  }

  return violations;
}

export async function guardFile(file: File): Promise<FileGuardResult> {
  const violations: FileGuardViolation[] = [];

  // Size check — performed first to avoid reading large files unnecessarily.
  if (file.size > MAX_FILE_SIZE_BYTES) {
    violations.push({
      severity: 'block',
      code: 'FILE_TOO_LARGE',
      message: `File exceeds the 50 MB limit (received ${(file.size / 1024 / 1024).toFixed(1)} MB)`,
    });
  }

  // Filename safety checks.
  if (UNSAFE_FILENAME_RE.test(file.name)) {
    violations.push({
      severity: 'block',
      code: 'UNSAFE_FILENAME',
      message: 'Filename contains unsafe characters or path-traversal sequences',
    });
  }

  if (file.name.length > 255) {
    violations.push({
      severity: 'block',
      code: 'FILENAME_TOO_LONG',
      message: 'Filename exceeds the 255-character limit',
    });
  }

  // Skip byte-level checks when already blocked; avoid reading the file.
  if (violations.some((v) => v.severity === 'block')) {
    return { ok: false, violations };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Magic bytes check — must precede content scan.
  if (!hasPdfMagic(bytes)) {
    violations.push({
      severity: 'block',
      code: 'INVALID_PDF_SIGNATURE',
      message: 'File does not begin with a valid PDF signature (%PDF header missing)',
    });
    return { ok: false, violations };
  }

  violations.push(...scanContent(bytes));

  return {
    ok: !violations.some((v) => v.severity === 'block'),
    violations,
  };
}
