import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 900,
    minWidth: 1100,
    minHeight: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }
}

ipcMain.handle('run-curl', async (_, payload: { method: string; url: string; headers: { key: string; value: string }[]; body: string }) => {
  const method = payload.method?.toUpperCase() || 'GET';
  const curlArgs = ['-i', '-sS', '-L'];

  for (const header of payload.headers ?? []) {
    if (header.key && header.value) {
      curlArgs.push('-H', `${header.key}: ${header.value}`);
    }
  }

  if (method !== 'GET' && payload.body) {
    curlArgs.push('-X', method, '--data-raw', payload.body);
  } else if (method === 'GET') {
    curlArgs.push('-X', method);
  }

  curlArgs.push(payload.url);

  return new Promise((resolve, reject) => {
    const child = spawn('curl', curlArgs, { shell: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('curl not found in PATH. Install curl on Windows and retry.'));
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      const parsed = parseCurlOutput(stdout);

      if (code !== 0) {
        reject(new Error(stderr || `Request failed with exit code ${code}.`));
        return;
      }

      resolve({
        statusCode: parsed.statusCode,
        statusText: parsed.statusText,
        headers: parsed.headers,
        body: parsed.body,
        rawOutput: stdout,
        error: stderr || '',
      });
    });
  });
});

ipcMain.handle('save-json-file', async (_, content: string, filename: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });

  if (!result.canceled && result.filePath) {
    await import('node:fs/promises').then((fs) => fs.writeFile(result.filePath, content, 'utf8'));
  }
});

ipcMain.handle('open-json-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const contents = await import('node:fs/promises').then((fs) => fs.readFile(filePath, 'utf8'));

  return { filePath, contents };
});

function parseCurlOutput(raw: string) {
  const lines = raw.split(/\r?\n/);
  const statusLine = lines.find((line) => /^HTTP\//.test(line));
  const statusMatch = statusLine?.match(/^HTTP\/\d\.\d\s+(\d{3})\s*(.*)$/);

  const headers: Record<string, string> = {};
  let bodyStartIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') {
      bodyStartIndex = index + 1;
      break;
    }
    if (/^HTTP\//.test(line)) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex > -1) {
      headers[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
    }
  }

  const body = bodyStartIndex > -1 ? lines.slice(bodyStartIndex).join('\n') : '';

  return {
    statusCode: Number(statusMatch?.[1] ?? 0),
    statusText: statusMatch?.[2] ?? '',
    headers,
    body,
  };
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
