const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HAS_SCHEME = /^[a-z][\w+.-]*:/iu;
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+([/?#].*)?$/u;

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif)(?:$|[?#])/iu;
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/iu;
const MAX_DATA_URL = 1_500_000;

/** An https image address, or a small png/jpeg/gif/webp data URL. Scripts and svg data stay empty. */
export function safePagesImageSrc(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("data:")) {
    if (raw.length > MAX_DATA_URL || !DATA_IMAGE.test(raw)) return "";
    return raw;
  }
  const href = safePagesHref(raw);
  if (!href.startsWith("https:")) return "";
  try {
    const url = new URL(href);
    return IMAGE_EXT.test(url.pathname + url.search) ? href : "";
  } catch {
    return "";
  }
}

/** File name shown when an image has no separate caption. */
export function imageAlt(src: string): string {
  try {
    const name = decodeURIComponent(new URL(src).pathname.split("/").pop() || "");
    return name || src;
  } catch {
    return src;
  }
}

/** Short label for a bookmark card: the site, or the address of a mailto link. */
export function bookmarkLabel(href: string): string {
  const safe = safePagesHref(href);
  if (!safe) return "";
  if (safe.startsWith("mailto:")) return safe.slice("mailto:".length);
  try {
    return new URL(safe).hostname.replace(/^www\./u, "");
  } catch {
    return safe;
  }
}

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
