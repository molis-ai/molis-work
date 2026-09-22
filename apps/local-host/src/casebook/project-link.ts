import type {CasebookHttpOptions} from './http.js';

/** Browser destination only; credentials and existing query parameters never enter the link. */
export function normalizeCasebookUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 2048) throw new Error('invalid_casebook_url');
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new Error('invalid_casebook_url');
  }
  return url.href;
}

export function casebookProjectHref(options: CasebookHttpOptions | undefined, projectRef: string | undefined): string | undefined {
  if (!options?.casebookUrl || !projectRef || !options.grants.some(grant => grant.project_ref === projectRef)) return undefined;
  try {
    const url = new URL(normalizeCasebookUrl(options.casebookUrl));
    url.searchParams.set('project_ref', projectRef);
    return url.href;
  } catch { return undefined; }
}
