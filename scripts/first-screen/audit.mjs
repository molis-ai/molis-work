import { MEASURED_PAGES, requestKey, SSE_FIRST_EVENT } from "./manifest.mjs";

const streamRequest = request => request.requested_stream || request.stream;

function registeredKey(registered, request) {
  const { url, document } = request;
  const stream = document ? requestKey(url, document, SSE_FIRST_EVENT) : undefined;
  if (streamRequest(request)) return registered.has(stream) ? stream : undefined;
  const finite = requestKey(url, document);
  if (registered.has(finite)) return finite;
  if (registered.has(url)) return url;
  // A failed stream may come back as JSON. Keep the source identity even without a stream response type.
  return registered.has(stream) ? stream : undefined;
}

function record(findings, request, visit) {
  const source = streamRequest(request) ? request.document ?? request.frame_id : undefined;
  const key = `${request.method} ${requestKey(request.url, source, SSE_FIRST_EVENT)}`;
  const entry = findings.get(key) ?? { method: request.method, path: request.url, visits: new Set(), outcomes: new Set(),
    ...(source ? { document: request.document, frames: new Set() } : {}) };
  entry.visits.add(visit);
  entry.outcomes.add(request.failed ?? request.status);
  if (entry.frames && request.frame_id) entry.frames.add(request.frame_id);
  findings.set(key, entry);
}

const details = findings => [...findings.values()].map(entry => ({ ...entry, visits: [...entry.visits], outcomes: [...entry.outcomes],
  ...(entry.frames ? { frames: [...entry.frames] } : {}) }));

// Non-GET requests really happened in the browser's disposable Home; the gate never replays them.
export function auditFirstScreen(http, browser) {
  const report = {};
  for (const [key, samples] of Object.entries(browser)) {
    const covered = http[key].responses;
    const registered = new Set(Object.keys(covered));
    const unregistered = new Map(), excluded = new Map(), seen = new Set();
    const measured = MEASURED_PAGES.includes(key.split("/")[0]);
    for (const { cold, warm } of samples) {
      for (const [visit, sample] of [["cold", cold], ["warm", warm]]) {
        for (const request of sample.requests) {
          if (request.method !== "GET" || !request.same_origin) { record(excluded, request, visit); continue; }
          const identity = registeredKey(registered, request);
          if (!identity) { record(unregistered, request, visit); continue; }
          seen.add(identity);
          const stream = covered[identity].response === SSE_FIRST_EVENT;
          const success = stream ? request.status === 200 && request.stream
            : request.status >= 200 && request.status < 300 || request.status === 304;
          if (measured && (!success || request.failed)) {
            const failure = request.failed ?? (stream && request.status === 200 ? "an unexpected response type" : `HTTP ${request.status}`);
            throw new Error(`${key} ${visit} GET ${identity}: browser returned ${failure}`);
          }
        }
      }
    }
    report[key] = {
      unregistered: details(unregistered),
      excluded: details(excluded),
      registered_not_observed: [...registered].filter(path => !seen.has(path)).sort(),
    };
  }
  return report;
}
