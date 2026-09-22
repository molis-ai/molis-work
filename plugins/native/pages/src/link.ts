const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HAS_SCHEME = /^[a-z][\w+.-]*:/iu;
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+([/?#].*)?$/u;

/** Normalize a user-supplied link target, dropping anything that is not a safe navigable URL. */
export function safePagesHref(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("#") || raw.startsWith("/")) return raw;
  const candidate = HAS_SCHEME.test(raw) ? raw : BARE_DOMAIN.test(raw) ? "https://" + raw : "";
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
