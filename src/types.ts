import type { HeaderRow, RequestPayload, ResponseState, JsonFileResult } from './types';

export interface WindowApi {
  runCurl: (payload: RequestPayload) => Promise<ResponseState>;
  saveJsonFile: (content: string, filename: string) => Promise<void>;
  openJsonFile: () => Promise<JsonFileResult | null>;
}

declare global {
  interface Window {
    api: WindowApi;
  }
}

export type { HeaderRow, RequestPayload, ResponseState, JsonFileResult };
