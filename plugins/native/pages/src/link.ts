const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HAS_SCHEME = /^[a-z][\w+.-]*:/iu;
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+([/?#].*)?$/u;

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif)(?:$|[?#])/iu;
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/iu;
const MAX_DATA_URL = 1_500_000;
const MIN_IMAGE_WIDTH = 120;
const MAX_IMAGE_WIDTH = 1600;

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

/** A local picture whose data URL stays inside the image size limit. */
export function acceptedImageFile(file: { type: string; size: number }): boolean {
  const type = file.type.trim().toLowerCase();
  if (!/^image\/(?:png|jpeg|gif|webp)$/u.test(type)) return false;
  if (!Number.isFinite(file.size) || file.size <= 0) return false;
  const encoded = `data:${type};base64,`.length + Math.ceil(file.size / 3) * 4;
  return encoded <= MAX_DATA_URL;
}

const MAX_CAPTION = 200;

/** A one-line picture caption. Line breaks become spaces, and anything past 200 characters is cut. */
export function safePagesImageCaption(value: unknown): string {
  const raw = String(value ?? "").replace(/[\r\n\t]+/gu, " ").replace(/ {2,}/gu, " ").trim();
  return raw.slice(0, MAX_CAPTION);
}

/** Pixel width for an image block. Zero means the picture uses the full line. */
export function safePagesImageWidth(value: unknown): number {
  const raw = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(MIN_IMAGE_WIDTH, Math.min(MAX_IMAGE_WIDTH, Math.round(raw)));
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

/** Plain click stays in the editor. Command-click or Control-click opens the link. */
export function linkClickOpens(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  if (event.button !== 0 || event.shiftKey || event.altKey) return false;
  return event.metaKey || event.ctrlKey;
}

/** A one-line bookmark name. Line breaks become spaces, and anything past 120 characters is cut. */
export function safePagesBookmarkTitle(value: unknown): string {
  const raw = String(value ?? "").replace(/[\r\n\t]+/gu, " ").replace(/ {2,}/gu, " ").trim();
  return raw.slice(0, 120);
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
