import { CONVERSATION_ATTACHMENT_IMAGE_TYPES, type ConversationAttachment, type ConversationAttachmentContent, type ConversationAttachmentImageType, type MaterialCoverageStatus } from "./conversation-attachments.js";

export { CONVERSATION_ATTACHMENT_IMAGE_TYPES, type ConversationAttachment, type ConversationAttachmentContent, type ConversationAttachmentImageType, type MaterialCoverageStatus };

/** Host extraction consumes already-authorized bytes, never an arbitrary filesystem path. */
export interface MaterialSource { file_name: string; bytes: Uint8Array }
export interface MaterialLine { text: string; confidence: number | null }
export interface MaterialPage { number: number; text: string; method: string; confidence: number | null; lines?: MaterialLine[] }
export interface MaterialExtraction {
  text: string;
  title?: string;
  extractor: string;
  pages: MaterialPage[];
  /** Timed captions a public source publishes with its video (never a transcription made on this machine). */
  segments?: { start_seconds: number; end_seconds: number; text: string }[];
  coverage: {
    status: MaterialCoverageStatus;
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
  ocrLanguages?: readonly ("zh-Hans" | "zh-Hant" | "en-US" | "ja-JP")[];
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
  const parts = path.split("/"), name = (parts.at(-1) ?? "").toLowerCase(), envTpl = /^\.env\.(example|sample|template)$/u.test(name);
  const ignored = ["node_modules", "vendor", "dist", "build", "target", "out", "coverage", "__pycache__", "venv", "pods", "carthage"];
  if (parts.slice(0, -1).some(part => part.startsWith(".") || ignored.includes(part.toLowerCase()))) return "ignored";
  const hiddenKept = [".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", ".prettierrc", ".eslintrc", ".nvmrc", ".node-version", ".tool-versions"];
  if ((!envTpl && /^\.env(\..+)?$/u.test(name)) || /\.(pem|key|p12|pfx|keystore|jks|tfvars)$/u.test(name) || /\.tfstate(\..+)?$/u.test(name)
    || /^(id_(rsa|ed25519|ecdsa|dsa)(\.pub)?|(credentials|service[-_]account|client_secret).*\.json|auth\.json|\.(npmrc|netrc|pypirc|pgpass)|secrets?\..+)$/u.test(name)) return "secret";
  if (!envTpl && name.startsWith(".") && !hiddenKept.some(kept => name === kept || name.startsWith(kept + "."))) return "ignored";
  const ext = /\.([a-z0-9]+)$/u.exec(name)?.[1] ?? "";
  const bin = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "ico", "icns", "psd", "sketch", "fig", "mp3", "wav", "m4a", "aac", "aiff", "aif", "flac", "ogg", "mp4", "mov", "m4v", "webm", "avi", "mkv", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "dmg", "pkg", "iso", "jar", "war", "exe", "dll", "so", "dylib", "a", "o", "obj", "class", "pyc", "wasm", "bin", "dat", "db", "sqlite", "sqlite3", "woff", "woff2", "ttf", "otf", "eot", "doc", "xls", "xlsx", "ppt", "pptx", "numbers", "pages"];
  return bin.includes(ext) ? "unreadable" : null;
}

/**
 * Which rule name (`node_modules`, `.git`, `.DS_Store`, ...) caused `contextFileSkip` to return `"ignored"`.
 * Self-contained for the same reason as `contextFileSkip`: the onboarding page runs it as its source text.
 */
export function contextSkipRuleName(path: string): string {
  const parts = String(path || "").split("/");
  const ignoredFolders = ["node_modules", "vendor", "dist", "build", "target", "out", "coverage", "__pycache__", "venv", "pods", "carthage"];
  for (const part of parts.slice(0, -1)) {
    const low = part.toLowerCase();
    if (part.startsWith(".")) return part;
    if (ignoredFolders.includes(low)) return low;
  }
  const last = parts.at(-1) ?? "";
  return last.startsWith(".") ? last : "";
}

/**
 * Whether a file at the top of a folder marks it as the root of code: a build or package file (ONB-44). Only a folder the person
 * chose themself (`custom`) and whose own top holds one is offered at adoption to a plugin that declares it takes a code folder
 * (batch12-design §7), and only when the person ticks it; Downloads, Documents and Desktop are never offered, however much code
 * they hold. Self-contained for the same
 * reason as `contextFileSkip`: the onboarding page runs it as its source text.
 */
export function codeRootFile(path: string): boolean {
  const roots = ["package.json", "cargo.toml", "go.mod", "pyproject.toml", "setup.py", "requirements.txt", "pom.xml", "build.gradle",
    "build.gradle.kts", "makefile", "cmakelists.txt", "package.swift", "gemfile", "composer.json", "deno.json", "mix.exs", "pubspec.yaml"];
  const name = path.toLowerCase();
  return !name.includes("/") && (roots.includes(name) || /\.(?:sln|csproj|fsproj)$/u.test(name));
}

/**
 * A file the person brings into a conversation (the assistant, Coding, a subagent's input; platform capability audit 2026-11-14 §6):
 * kept by the platform's material service as a material of its own, so it is read once, can be looked at again, and is still there
 * after a restart. The bytes never change: the subject id is `ca_` and their lowercase sha256, and the pin's `read_revision` is that sha256. It belongs to the
 * caller that attached it (its installation, and its project or the Home) and only that caller reads it back; the platform reads it
 * for that caller when a round shows it to the model. Nothing here is a 成果: an attachment never enters the 成果库.
 */
export const CONVERSATION_ATTACHMENT_SUBJECT_KIND = "conversation_attachment";
export const CONVERSATION_ATTACHMENT_LIMITS = {
  round_images: 6,
  /** A picture: what the model providers take in one image. */
  image_bytes: 5 * 1024 * 1024,
  /** A document read for its text (PDF, Office, text, a picture's words, a recording's transcript). */
  document_bytes: 25 * 1024 * 1024,
  /** The most of a document's text that is kept and given to a round. */
  text_chars: 200_000,
  /** A name as the person sees it. */
  title_chars: 200,
} as const;

/** How one caller reads back what it attached. */
export interface ConversationAttachmentRequest { signal?: AbortSignal; as: "text" | "image" }
/** A caller with an image-only entry can refuse other files before any extraction or write. */
export interface ConversationAttachmentUploadRequest { signal?: AbortSignal; expected_kind?: "image" }
