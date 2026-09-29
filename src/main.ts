import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    minWidth: 1100,
    minHeight: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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

  const body = bodyStartIndex > -1 ? lines.slice(bodyStartIndex).join('\n').trim() : '';

  return {
    statusCode: Number(statusMatch?.[1] ?? 0),
    statusText: statusMatch?.[2] ?? '',
    headers,
    body,
  };
}

ipcMain.handle('run-curl', async (_, payload: { method: string; url: string; headers: Array<{ key: string; value: string }>; body: string }) => {
  const method = payload.method?.toUpperCase() || 'GET';
  const curlArgs: string[] = ['-i', '-sS', '-L'];

  if (payload.headers && Array.isArray(payload.headers)) {
    for (const header of payload.headers) {
      if (header.key && header.value) {
        curlArgs.push('-H', `${header.key}: ${header.value}`);
      }
    }
  }

  if (method !== 'GET' && payload.body) {
    curlArgs.push('-X', method, '--data-raw', payload.body);
  } else if (method !== 'GET') {
    curlArgs.push('-X', method);
  }

  if (payload.url) {
    curlArgs.push(payload.url);
  }

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    try {
      const child = spawn('curl', curlArgs, {
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'ENOENT') {
          reject(
            new Error(
              'curl not found in PATH. Please install curl on Windows. ' +
              'Visit: https://curl.se/download.html or install via Chocolatey: choco install curl',
            ),
          );
        } else {
          reject(new Error(`Failed to run curl: ${error.message}`));
        }
      });

      child.on('close', (code: number) => {
        if (code !== 0 && stderr) {
          reject(new Error(`curl error: ${stderr}`));
          return;
        }

        try {
          const parsed = parseCurlOutput(stdout);
          resolve({
            statusCode: parsed.statusCode,
            statusText: parsed.statusText,
            headers: parsed.headers,
            body: parsed.body,
            rawOutput: stdout,
            error: '',
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse curl response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
        }
      });
    } catch (error) {
      reject(new Error(`Failed to spawn curl: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });
});

ipcMain.handle('save-json-file', async (_, content: string, filename: string) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow || new BrowserWindow({ show: false }), {
      defaultPath: filename,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, content, 'utf8');
    }
  } catch (error) {
    throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('open-json-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow || new BrowserWindow({ show: false }), {
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const contents = await fs.readFile(filePath, 'utf8');

    return { filePath, contents };
  } catch (error) {
    throw new Error(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

app.on('ready', () => {
  createWindow();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
