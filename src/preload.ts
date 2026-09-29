import { contextBridge, ipcRenderer } from 'electron';
import type { WindowApi, RequestPayload, ResponseState, JsonFileResult } from './types';

const api: WindowApi = {
  runCurl: (payload: RequestPayload): Promise<ResponseState> =>
    ipcRenderer.invoke('run-curl', payload),
  saveJsonFile: (content: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('save-json-file', content, filename),
  openJsonFile: (): Promise<JsonFileResult | null> =>
    ipcRenderer.invoke('open-json-file'),
};

contextBridge.exposeInMainWorld('api', api);
