/** Host extraction consumes already-authorized bytes, never an arbitrary filesystem path. */
export interface MaterialSource { file_name: string; bytes: Uint8Array }
export interface MaterialLine { text: string; confidence: number | null }
export interface MaterialPage { number: number; text: string; method: string; confidence: number | null; lines?: MaterialLine[] }
export interface MaterialExtraction {
  text: string;
  title?: string;
  extractor: string;
  pages: MaterialPage[];
  segments?: { start_seconds: number; end_seconds: number; text: string }[];
  frames?: { seconds: number; text: string; confidence?: number | null }[];
  duration_seconds?: number;
  coverage: {
    status: "sufficient" | "partial" | "insufficient";
    /** True when a configured page or text budget stopped extraction. */
    truncated?: boolean;
    processed_pages: number;
    total_pages: number;
    issues: string[];
  };
}
export interface MaterialLimits {
  maxBytes: number;
  maxCharacters: number;
  maxTextBytes: number;
  maxPages: number;
}
export interface MaterialExtractionOptions {
  signal?: AbortSignal;
  limits?: Partial<MaterialLimits>;
  timeoutMs?: number;
  textFormat?: "text" | "markdown";
  pdfMode?: "text" | "ocr";
  /** Recognition languages are selected by the consuming feature; omission retains the Host defaults. */
  ocrLanguages?: readonly ("zh-Hans" | "zh-Hant" | "en-US")[];
  allowModelDownload?: boolean;
  onProgress?: (progress: { stage: string; progress: number }) => void;
}
/** Source identity, saved originals, business conversions and citation rules remain with consumers. */
export type MaterialExtractor = (source: MaterialSource, options?: MaterialExtractionOptions) => Promise<MaterialExtraction>;

/** Read an explicitly authorized HTTP(S) page; the Host owns bounded transport and HTML extraction. */
export type MaterialWebsiteReader = (url: string, options?: { signal?: AbortSignal; beforeDispatch?(): void | Promise<void> }) => Promise<MaterialExtraction>;

/** Transport form; the Host validates and decodes it before parsing. */
export interface MaterialUpload { file_name: string; data_base64: string }
export interface MaterialDocument {
  name: string;
  format: "markdown" | "html" | "text" | "csv";
  content: string;
  /** Semantic content has no stable page number; do not invent one for DOCX or archive entries. */
  coverage: Pick<MaterialExtraction["coverage"], "status" | "issues" | "truncated">;
}
export interface MaterialDocumentBatch { documents: MaterialDocument[]; warnings: string[] }
export interface MaterialDocumentOptions { signal?: AbortSignal; timeoutMs?: number }
export type MaterialDocumentReader = (sources: readonly MaterialSource[], options?: MaterialDocumentOptions) => Promise<MaterialDocumentBatch>;

/** The readable content and provenance of a public source; business conversions remain with the plugin. */
export interface MaterialSourceContent {
  text: string;
  title?: string;
  source_url: string;
  provider: string;
  extractor: string;
  coverage: MaterialExtraction["coverage"];
  pages?: MaterialExtraction["pages"];
  segments?: MaterialExtraction["segments"];
  frames?: MaterialExtraction["frames"];
  model_required?: { approximate_bytes?: number; variant?: string };
}

/**
 * Which files of a folder the person chose onboarding takes in (specs/onboarding-coverage §3.14, ONB-37). Not a list of the kinds it
 * may read: a file is taken unless it is under a folder that is never material (dependencies, build output, version control, any
 * hidden folder), it is a secret by its name, or it is a kind whose body cannot be read as text or parsed (images, media, archives,
 * programs, fonts, the office formats without a reader). Everything else, a stranger suffix or none at all, is read for what it holds;
 * the reader says why a file it takes turns out not to be text (`decodeMaterialText`), so nothing readable disappears unseen.
 *
 * Self-contained on purpose: the onboarding page runs this same function as its source text, and the Host checks the selection
 * with it, so the page and the Host never keep two lists (as `platform/loopback` is the one test of a local address). The desktop
 * shell walks a granted folder natively with its own copy (`apps/desktop/adapters/tauri/src/context_directory_files.rs`), held to
 * the same cases by its test `file_rule_matches_the_hosts`.
 */
export function contextFileSkip(path: string): "ignored" | "secret" | "unreadable" | null {
  const parts = path.split("/"), name = (parts.at(-1) ?? "").toLowerCase();
  const ignoredFolders = ["node_modules", "vendor", "dist", "build", "target", "out", "coverage", "__pycache__", "venv", "pods", "carthage"];
  if (parts.slice(0, -1).some(part => part.startsWith(".") || ignoredFolders.includes(part.toLowerCase()))) return "ignored";
  // Hidden files that only say how a project is kept; any other hidden file may hold a credential and is not sent.
  const hiddenKept = [".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", ".prettierrc", ".eslintrc", ".nvmrc", ".node-version", ".tool-versions"];
  if (/^\.env(\..*)?$/u.test(name) || /\.(pem|key|p12|pfx|keystore|jks)$/u.test(name) || /^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/u.test(name)) return "secret";
  if (name.startsWith(".") && !hiddenKept.some(kept => name === kept || name.startsWith(kept + "."))) return "ignored";
  const extension = /\.([a-z0-9]+)$/u.exec(name)?.[1] ?? "";
  const unreadable = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "ico", "icns", "psd", "sketch", "fig",
    "mp3", "wav", "m4a", "aac", "aiff", "aif", "flac", "ogg", "mp4", "mov", "m4v", "webm", "avi", "mkv",
    "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "dmg", "pkg", "iso", "jar", "war",
    "exe", "dll", "so", "dylib", "a", "o", "obj", "class", "pyc", "wasm", "bin", "dat", "db", "sqlite", "sqlite3",
    "woff", "woff2", "ttf", "otf", "eot", "doc", "xls", "xlsx", "ppt", "pptx", "numbers", "pages"];
  return unreadable.includes(extension) ? "unreadable" : null;
}

/**
 * Whether a file at the top of a folder marks it as the root of code: a build or package file (ONB-44). Only a folder the person
 * chose themself (`custom`) and whose own top holds one is offered to Coding as its working folder at adoption, and only when the
 * person ticks it; Downloads, Documents and Desktop are never offered, however much code they hold. Self-contained for the same
 * reason as `contextFileSkip`: the onboarding page runs it as its source text.
 */
export function codeRootFile(path: string): boolean {
  const roots = ["package.json", "cargo.toml", "go.mod", "pyproject.toml", "setup.py", "requirements.txt", "pom.xml", "build.gradle",
    "build.gradle.kts", "makefile", "cmakelists.txt", "package.swift", "gemfile", "composer.json", "deno.json", "mix.exs", "pubspec.yaml"];
  const name = path.toLowerCase();
  return !name.includes("/") && (roots.includes(name) || /\.(?:sln|csproj|fsproj)$/u.test(name));
}
