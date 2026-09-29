export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

export interface RequestFormState {
  name: string;
  method: HttpMethod;
  url: string;
  bookingId: string;
  bookingMode: 'path' | 'query';
  queryParamName: string;
  pathTemplate: string;
  headers: HeaderRow[];
  body: string;
}

export interface RequestPayload {
  method: string;
  url: string;
  headers: HeaderRow[];
  body: string;
}

export interface ResponseState {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  rawOutput: string;
  error: string;
}

export interface CollectionRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  bookingId?: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface CollectionEntry {
  name: string;
  requests: CollectionRequest[];
}

export interface CollectionFile {
  collections: CollectionEntry[];
}

export interface JsonFileResult {
  filePath: string;
  contents: string;
}

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
