/**
 * External text (a feed item, a pasted page, a tool's output) can contain copied credentials. Redact common secret shapes
 * (private keys, auth and cookie headers, token / secret / password values, known token prefixes, JWTs) before a plugin
 * passes that text to a model or shows it back.
 */
export function redactSecrets(value: string): string {
  return value
    .replace(
      /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]*/gi,
      "$1: [REDACTED]",
    )
    .replace(
      /((?:"|')?(?:(?:access|refresh|id)[_-]?token|token|client[_-]?secret|api[_-]?key|password|passwd|credential|secret)(?:"|')?)(\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&,;]+)/gi,
      "$1$2[REDACTED]",
    )
    .replace(
      /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|ya29\.[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g,
      "[REDACTED TOKEN]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[REDACTED TOKEN]",
    );
}
