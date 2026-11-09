import { MEASURED_PAGES } from "./manifest.mjs";

function record(findings, request, visit) {
  const key = `${request.method} ${request.url}`;
  const entry = findings.get(key) ?? { method: request.method, path: request.url, visits: new Set(), outcomes: new Set() };
  entry.visits.add(visit);
  entry.outcomes.add(request.failed ?? request.status);
  findings.set(key, entry);
}

const details = findings => [...findings.values()].map(entry => ({ ...entry, visits: [...entry.visits], outcomes: [...entry.outcomes] }));

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
          if (!registered.has(request.url)) { record(unregistered, request, visit); continue; }
          seen.add(request.url);
          const success = request.status >= 200 && request.status < 300 || request.status === 304;
          if (measured && (!success || request.failed)) {
            throw new Error(`${key} ${visit} GET ${request.url}: browser returned ${request.failed ?? `HTTP ${request.status}`}`);
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
