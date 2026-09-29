import { useEffect, useMemo, useState } from 'react';
import type { HeaderRow, RequestFormState, ResponseState, CollectionFile } from './types';

const defaultHeaders: HeaderRow[] = [
  { id: crypto.randomUUID(), key: 'Accept', value: 'application/json' },
];

const initialRequest: RequestFormState = {
  name: 'Get bookings',
  method: 'GET',
  url: 'https://restful-booker.herokuapp.com/booking',
  bookingId: '',
  bookingMode: 'path',
  queryParamName: 'bookingid',
  pathTemplate: '/booking/{id}',
  headers: defaultHeaders,
  body: '',
};

function buildRequestUrl(
  baseUrl: string,
  bookingId: string,
  bookingMode: 'path' | 'query',
  queryParamName: string,
): string {
  if (!bookingId) return baseUrl;

  const cleanUrl = baseUrl.trim();

  if (bookingMode === 'query') {
    const hasQuery = cleanUrl.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `${cleanUrl}${separator}${queryParamName}=${encodeURIComponent(bookingId)}`;
  }

  if (cleanUrl.includes('{id}')) {
    return cleanUrl.replace('{id}', encodeURIComponent(bookingId));
  }

  if (cleanUrl.endsWith('/')) {
    return `${cleanUrl}${encodeURIComponent(bookingId)}`;
  }

  return `${cleanUrl}/${encodeURIComponent(bookingId)}`;
}

function tryParseJson(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function App() {
  const [request, setRequest] = useState<RequestFormState>(initialRequest);
  const [response, setResponse] = useState<ResponseState>({
    statusCode: 0,
    statusText: '',
    headers: {},
    body: '',
    rawOutput: '',
    error: '',
  });
  const [history, setHistory] = useState<RequestFormState[]>([]);
  const [collectionName, setCollectionName] = useState('Example');
  const [loading, setLoading] = useState(false);

  const previewUrl = useMemo(
    () => buildRequestUrl(request.url, request.bookingId, request.bookingMode, request.queryParamName),
    [request],
  );

  useEffect(() => {
    const rawHistory = window.localStorage.getItem('simple-curl-history');
    if (rawHistory) {
      try {
        setHistory(JSON.parse(rawHistory) as RequestFormState[]);
      } catch {
        window.localStorage.removeItem('simple-curl-history');
      }
    }
  }, []);

  const updateHeader = (id: string, field: 'key' | 'value', value: string) => {
    setRequest((current) => ({
      ...current,
      headers: current.headers.map((header) =>
        header.id === id ? { ...header, [field]: value } : header,
      ),
    }));
  };

  const addHeader = () => {
    setRequest((current) => ({
      ...current,
      headers: [...current.headers, { id: crypto.randomUUID(), key: '', value: '' }],
    }));
  };

  const removeHeader = (id: string) => {
    setRequest((current) => ({
      ...current,
      headers: current.headers.filter((header) => header.id !== id),
    }));
  };

  const saveHistory = (items: RequestFormState[]) => {
    setHistory(items);
    window.localStorage.setItem('simple-curl-history', JSON.stringify(items.slice(0, 20)));
  };

  const handleSend = async () => {
    if (!request.url || !/^https?:\/\//i.test(request.url)) {
      setResponse({
        statusCode: 0,
        statusText: 'Invalid URL',
        headers: {},
        body: '',
        rawOutput: '',
        error: 'URL must start with http:// or https://.',
      });
      return;
    }

    setLoading(true);
    const finalUrl = buildRequestUrl(
      request.url,
      request.bookingId,
      request.bookingMode,
      request.queryParamName,
    );
    const effectiveHeaders = request.headers.filter((header) => header.key.trim() !== '');

    try {
      const result = await window.api.runCurl({
        method: request.method,
        url: finalUrl,
        headers: effectiveHeaders,
        body: request.body,
      });

      setResponse({
        ...result,
        statusCode: result.statusCode ?? 0,
        statusText: result.statusText ?? '',
        body: tryParseJson(result.body),
      });

      const entry = { ...request, url: finalUrl };
      saveHistory([entry, ...history].slice(0, 20));
    } catch (error) {
      setResponse({
        statusCode: 0,
        statusText: 'Request failed',
        headers: {},
        body: '',
        rawOutput: '',
        error: error instanceof Error ? error.message : 'Unknown request error.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const payload: CollectionFile = {
      collections: [
        {
          name: collectionName || 'Example',
          requests: [
            {
              id: crypto.randomUUID(),
              name: request.name || 'Request',
              method: request.method,
              url: previewUrl,
              bookingId: request.bookingId || '',
              headers: Object.fromEntries(
                request.headers
                  .filter((header) => header.key)
                  .map((header) => [header.key, header.value]),
              ),
              body: request.body || null,
            },
          ],
        },
      ],
    };

    try {
      await window.api.saveJsonFile(
        JSON.stringify(payload, null, 2),
        `${collectionName || 'example'}-collection.json`,
      );
    } catch (error) {
      setResponse({
        statusCode: 0,
        statusText: 'Export failed',
        headers: {},
        body: '',
        rawOutput: '',
        error: error instanceof Error ? error.message : 'Failed to export collection.',
      });
    }
  };

  const handleImport = async () => {
    try {
      const fileResult = await window.api.openJsonFile();
      if (!fileResult) return;

      const parsed = JSON.parse(fileResult.contents) as CollectionFile;
      const firstRequest = parsed.collections?.[0]?.requests?.[0];
      if (!firstRequest) {
        throw new Error('The selected file does not contain a valid request collection.');
      }

      setCollectionName(parsed.collections?.[0]?.name ?? 'Example');
      setRequest({
        name: firstRequest.name,
        method: firstRequest.method,
        url: firstRequest.url,
        bookingId: firstRequest.bookingId ?? '',
        bookingMode: 'path',
        queryParamName: 'bookingid',
        pathTemplate: '/booking/{id}',
        headers: Object.entries(firstRequest.headers ?? {}).map(([key, value]) => ({
          id: crypto.randomUUID(),
          key,
          value: String(value),
        })),
        body: typeof firstRequest.body === 'string' ? firstRequest.body : '',
      });
    } catch (error) {
      setResponse({
        statusCode: 0,
        statusText: 'Import failed',
        headers: {},
        body: '',
        rawOutput: '',
        error: error instanceof Error ? error.message : 'The selected file could not be imported.',
      });
    }
  };

  const loadHistoryItem = (item: RequestFormState) => {
    setRequest(item);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Simple Curl</h2>
        <button
          className="secondary"
          onClick={() =>
            setRequest({
              ...initialRequest,
              name: 'Load example request',
              url: 'https://restful-booker.herokuapp.com/booking',
              method: 'GET',
            })
          }
        >
          Load example
        </button>

        <div className="stack">
          <label>
            Name
            <input
              value={request.name}
              onChange={(event) => setRequest({ ...request, name: event.target.value })}
            />
          </label>

          <label>
            Method
            <select
              value={request.method}
              onChange={(event) =>
                setRequest({
                  ...request,
                  method: event.target.value as RequestFormState['method'],
                })
              }
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>

          <label>
            URL
            <input
              value={request.url}
              onChange={(event) => setRequest({ ...request, url: event.target.value })}
            />
          </label>

          <div className="booking-block">
            <label>
              Booking ID
              <input
                value={request.bookingId}
                onChange={(event) => setRequest({ ...request, bookingId: event.target.value })}
              />
            </label>
            <label>
              Insert mode
              <select
                value={request.bookingMode}
                onChange={(event) =>
                  setRequest({
                    ...request,
                    bookingMode: event.target.value as 'path' | 'query',
                  })
                }
              >
                <option value="path">Insert into URL</option>
                <option value="query">Use as query param</option>
              </select>
            </label>
            <label>
              Query param name
              <input
                value={request.queryParamName}
                onChange={(event) =>
                  setRequest({ ...request, queryParamName: event.target.value })
                }
              />
            </label>
          </div>

          <div className="preview-box">
            <strong>Preview URL</strong>
            <div>{previewUrl}</div>
          </div>

          <div className="headers-panel">
            <div className="row-between">
              <strong>Headers</strong>
              <button className="secondary" onClick={addHeader}>
                Add header
              </button>
            </div>
            {request.headers.map((header) => (
              <div className="header-row" key={header.id}>
                <input
                  placeholder="Header name"
                  value={header.key}
                  onChange={(event) => updateHeader(header.id, 'key', event.target.value)}
                />
                <input
                  placeholder="Header value"
                  value={header.value}
                  onChange={(event) => updateHeader(header.id, 'value', event.target.value)}
                />
                <button className="danger" onClick={() => removeHeader(header.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <label>
            Body
            <textarea
              value={request.body}
              onChange={(event) => setRequest({ ...request, body: event.target.value })}
              rows={8}
            />
          </label>

          <div className="button-row">
            <button
              onClick={handleSend}
              disabled={!/^https?:\/\//i.test(request.url) || loading}
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
            <button className="secondary" onClick={handleExport}>
              Export
            </button>
            <button className="secondary" onClick={handleImport}>
              Import
            </button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <div className="section">
          <h3>Response</h3>
          {response.error ? <div className="error-box">{response.error}</div> : null}
          {response.statusCode ? (
            <div className="status-pill">
              {response.statusCode} {response.statusText}
            </div>
          ) : null}

          {Object.keys(response.headers).length > 0 ? (
            <div className="response-box">
              <h4>Headers</h4>
              <pre>{JSON.stringify(response.headers, null, 2)}</pre>
            </div>
          ) : null}

          <div className="response-box">
            <h4>Body</h4>
            <pre>{response.body || 'No response body.'}</pre>
          </div>
        </div>

        <div className="section">
          <div className="row-between">
            <h3>History</h3>
            <input
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
              placeholder="Collection name"
            />
          </div>
          {history.length === 0 ? (
            <div className="empty-state">No recent requests yet.</div>
          ) : (
            <ul className="history-list">
              {history.map((item, index) => (
                <li key={`${item.name}-${index}`} onClick={() => loadHistoryItem(item)}>
                  <span className="method-badge">{item.method}</span>
                  <span>{item.name}</span>
                  <small>{item.url}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
