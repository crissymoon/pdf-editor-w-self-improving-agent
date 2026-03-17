const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function runProcess(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

ipcMain.handle('xcm:emailPdf', async (_event, payload) => {
  const to = String(payload?.to ?? '').trim();
  if (!to) {
    return { ok: false, message: 'Missing recipient email (to).' };
  }

  const subject = String(payload?.subject ?? 'XCM-PDF document').trim() || 'XCM-PDF document';
  const body = String(payload?.body ?? 'Attached is your PDF from XCM-PDF.').trim() || 'Attached is your PDF from XCM-PDF.';
  const filename = String(payload?.filename ?? 'xcm-pdf-edited.pdf').trim() || 'xcm-pdf-edited.pdf';
  const bytesRaw = payload?.pdfBytesBase64;
  if (typeof bytesRaw !== 'string' || bytesRaw.length === 0) {
    return { ok: false, message: 'Missing PDF bytes.' };
  }

  const appPath = app.getAppPath();
  const scriptPath = path.join(appPath, 'scripts', 'email', 'send_pdf_email_smoke.py');

  try {
    await fs.access(scriptPath);
  } catch {
    return { ok: false, message: `Email script not found at ${scriptPath}` };
  }

  const tempPath = path.join(os.tmpdir(), `xcm-email-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  try {
    const pdfBytes = Buffer.from(bytesRaw, 'base64');
    await fs.writeFile(tempPath, pdfBytes);

    const pyArgs = [scriptPath, '--pdf', tempPath, '--to', to, '--subject', subject, '--body', body];
    const pythonCandidates = process.platform === 'win32'
      ? [['py', ['-3', ...pyArgs]], ['python', pyArgs]]
      : [['python3', pyArgs], ['python', pyArgs]];

    let last = { code: 1, stdout: '', stderr: 'Unable to launch Python.' };
    for (const [cmd, args] of pythonCandidates) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runProcess(cmd, args, appPath);
      last = result;
      if (result.code === 0) {
        return {
          ok: true,
          message: result.stdout.trim() || `Email queued to ${to}`,
        };
      }
    }

    return {
      ok: false,
      message: `Failed to send email. ${last.stderr || last.stdout || 'Unknown error'}`,
    };
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
