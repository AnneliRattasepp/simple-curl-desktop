import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  runCurl: (payload: { method: string; url: string; headers: { key: string; value: string }[]; body: string }) =>
    ipcRenderer.invoke('run-curl', payload),
  saveJsonFile: (content: string, filename: string) => ipcRenderer.invoke('save-json-file', content, filename),
  openJsonFile: () => ipcRenderer.invoke('open-json-file'),
});
