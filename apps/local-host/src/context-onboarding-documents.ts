import { createHash } from "node:crypto";
import { readWholeMaterial } from "./material-extraction.js";
import type { ContextReference, ContextSourceKind, HeldSecretMaterial, ImportFile, SecretSendDecision } from "./context-onboarding-store.js";
import { diskFull, readStagedFile, stageContextText, stageContextUpload, unreadableReason } from "./context-onboarding-staging.js";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  markdown: "text/markdown",
};

const KNOWN_DOC_EXTENSIONS = new Set(["md", "markdown", "txt", "log", "csv", "json", "html", "htm", "pdf", "docx"]);

/** True when a file had no standard document suffix and was accepted by content inspection (ONB-37). */
function isRecognizedByContent(filename: string): boolean {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
  return !ext || !KNOWN_DOC_EXTENSIONS.has(ext);
}

/** Stable approval key bound to `(kind, path, sha256)` so a modified file never inherits an old raw-send approval (S-onboarding-secret-hold). */
function secretMaterialKey(kind: ContextSourceKind, filePath: string, sha256: string): string {
  return createHash("sha256").update(JSON.stringify(["secret-hold", kind, filePath, sha256])).digest("hex");
}

const SECRET_FILENAME_RE = /^(?:\.env(?:\.(?!(?:example|sample|template)$).+)?|.*\.(?:pem|key|p12|pfx|keystore|jks)|id_(?:rsa|ed25519|ecdsa|dsa)|credentials(?:[._-].*)?\.json|service[-_]account(?:[._-].*)?\.json|client_secret(?:[._-].*)?\.json|(?:.*\b)?(?:secrets?|tokens?|apikeys?|credentials)\.(?:json|ya?ml|toml|ini|conf|cfg|properties|txt|env)|.*\.tfstate(?:\.backup)?|.*\.tfvars|\.(?:npmrc|netrc|pypirc|pgpass)|auth\.json)$/iu;
const PEM_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/gu;
const KNOWN_TOKEN_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "API_TOKEN", pattern: /\bsk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{20,}\b/gu },
  { label: "GITHUB_TOKEN", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/gu },
  { label: "GITHUB_PAT", pattern: /\bgithub_pat_[A-Za-z0-9_]{24,}\b/gu },
  { label: "AWS_ACCESS_KEY_ID", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu },
  { label: "GOOGLE_API_KEY", pattern: /\bAIza[0-9A-Za-z_-]{32,}\b/gu },
  { label: "SLACK_TOKEN", pattern: /\bxox[baprs]-[0-9A-Za-z-]{16,}\b/gu },
  { label: "STRIPE_LIVE_KEY", pattern: /\b(?:rk|pk)_live_[0-9A-Za-z]{20,}\b/gu },
  { label: "NPM_TOKEN", pattern: /\bnpm_[A-Za-z0-9]{20,}\b/gu },
];
const SECRET_ASSIGNMENT_RE = /(?:^|[\s,{:/])["']?([A-Za-z0-9_.-]*(?:API[_-]?KEY|SECRET[_-]?KEY|PRIVATE[_-]?KEY|ENCRYPTION[_-]?KEY|SIGNING[_-]?KEY|MASTER[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET|WEBHOOK[_-]?SECRET|JWT[_-]?SECRET|SESSION[_-]?SECRET|APP[_-]?SECRET|AUTH[_-]?SECRET|COOKIE[_-]?SECRET|NEXTAUTH[_-]?SECRET|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|AUTH[_-]?TOKEN|BEARER[_-]?TOKEN|SESSION[_-]?TOKEN|BOT[_-]?TOKEN|API[_-]?TOKEN|_authToken|_password|_auth|DATABASE_URL|REDIS_URL|MONGODB_URI|PASSWORD|PASSWD|DB_PASS)|(?:[A-Za-z0-9_.-]+[_.-])?(?:SECRET|PASS(?:WORD)?|TOKEN))["']?\s*(?:=|:)\s*(?:"([^"\r\n]{4,})"|'([^'\r\n]{4,})'|([^\s"',;}{()#]{4,})(?!\s*\())/gimu;
const CREDENTIAL_URI_RE = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^:\s/@]+:([^@\s/]{3,})@[^\s"']+/giu;
const NETRC_PASSWORD_RE = /\bmachine\s+\S+[\s\S]{0,160}?\bpassword\s+([^\s#\r\n]{4,})/giu;
const PGPASS_LINE_RE = /^[^:\s#]+:\d+:[^:\s]+:[^:\s]+:([^\s:#]{4,})$/gmu;
const PLACEHOLDER_VALUE_RE = /^(?:your[_-]|example|changeme|placeholder|dummy|fake|mock|test[_-]?key|todo|none|xxx+|\*+|null|undefined|true|false|string|number|boolean|bigint|symbol|object|unknown|never|void|any|<[^>]+>|\$\{[^}]+\}|\$[A-Za-z_]|process\.env|os\.environ|os\.getenv|System\.getenv)/iu;
const CODE_MEMBER_ACCESS_RE = /^[a-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/u;

/**
 * Inspects a file's path and extracted text for credentials or secret material before anything is staged as readable text or sent
 * to a model (`ONB-37`, `C2`, `S-onboarding-secret-hold`). Never returns secret values — only variable/token labels.
 */
export function detectMaterialSecret(filePath: string, text: string): { reason: string; previewNames: string[] } | null {
  const filename = (filePath.split("/").at(-1) ?? filePath).trim();
  const names = new Set<string>();
  const byName = SECRET_FILENAME_RE.test(filename);
  if (PEM_KEY_RE.test(text)) names.add("PRIVATE_KEY");
  PEM_KEY_RE.lastIndex = 0;
  for (const { label, pattern } of KNOWN_TOKEN_PATTERNS) {
    if (pattern.test(text)) names.add(label);
    pattern.lastIndex = 0;
  }
  for (const match of text.matchAll(SECRET_ASSIGNMENT_RE)) {
    const keyName = match[1]?.trim() ?? "";
    const quotedValue = match[2] ?? match[3];
    const unquotedValue = match[4];
    const rawValue = (quotedValue ?? unquotedValue ?? "").trim();
    if (!keyName || !rawValue || PLACEHOLDER_VALUE_RE.test(rawValue)) continue;
    if (unquotedValue !== undefined) {
      if (/^(?:export|const|let|var|type|interface|function|return|await)\b/u.test(rawValue)) continue;
      if (!byName && CODE_MEMBER_ACCESS_RE.test(rawValue)) continue;
    }
    names.add(keyName.slice(0, 48));
    if (names.size >= 6) break;
  }
  if (CREDENTIAL_URI_RE.test(text)) names.add("DATABASE_URL");
  CREDENTIAL_URI_RE.lastIndex = 0;
  if (NETRC_PASSWORD_RE.test(text)) names.add("NETRC_PASSWORD");
  NETRC_PASSWORD_RE.lastIndex = 0;
  if (PGPASS_LINE_RE.test(text)) names.add("PGPASS_PASSWORD");
  PGPASS_LINE_RE.lastIndex = 0;
  if (!byName && names.size === 0) return null;
  const previewNames = [...names].slice(0, 6);
  const reason = previewNames.length
    ? `检测到 ${previewNames.slice(0, 3).join(", ")}${previewNames.length > 3 ? ` 等 ${previewNames.length} 项` : ""}疑似密钥，默认已拦截，不会把原值发给模型。`
    : `文件名「${filename}」属于常见凭据或密钥配置，默认已拦截，不会把原值发给模型。`;
  return { reason, previewNames };
}

/**
 * Redacts secret values while preserving variable, key, and structure names when the person picks "只发变量名（去掉值）" (`C2`).
 */
export function stripMaterialSecrets(text: string): string {
  let out = text.replace(PEM_KEY_RE, "[PRIVATE_KEY_REDACTED]");
  for (const { pattern } of KNOWN_TOKEN_PATTERNS) {
    out = out.replace(pattern, "<REDACTED>");
  }
  out = out.replace(CREDENTIAL_URI_RE, (full, pass: string) => full.replace(`:${pass}@`, ":<REDACTED>@"));
  out = out.replace(/\b(password|account)\s+(?!<REDACTED>)([^\s#\r\n]+)/giu, "$1 <REDACTED>");
  out = out.replace(/^([^:\s#]+:\d+:[^:\s]+:[^:\s]+:)(?!<REDACTED>)([^\r\n#]+)(\s*#.*)?$/gmu, "$1<REDACTED>$3");
  out = out.replace(/^(\s*(?:\/\/[^\s=:]+:)?_(?:authToken|password|auth)\s*=\s*)(?!<REDACTED>)([^\r\n#]+)(\s*#.*)?$/gimu, "$1<REDACTED>$3");
  out = out.replace(SECRET_ASSIGNMENT_RE, (full, _keyName: string, q1?: string, q2?: string, unquoted?: string) => {
    const rawValue = (q1 ?? q2 ?? unquoted ?? "").trim();
    if (!rawValue || PLACEHOLDER_VALUE_RE.test(rawValue)) return full;
    const idx = full.lastIndexOf(rawValue);
    return idx >= 0 ? full.slice(0, idx) + "<REDACTED>" + full.slice(idx + rawValue.length) : full;
  });
  // Held secret files chosen for "strip" keep only variable/key/structure names: redact remaining quoted or scalar key-value assignments of any length.
  out = out.replace(/^(\s*(?:-\s+)?["']?[A-Za-z0-9_./@-]{1,96}["']?\s*(?:=|:)\s*)(["'])(?!<REDACTED>\2)([^"'\r\n]+)\2/gmu, "$1$2<REDACTED>$2");
  out = out.replace(/^(\s*(?:export\s+|-\s+)?[A-Za-z_][A-Za-z0-9_.-]{0,95}\s*(?:=|:)\s*)(?!<REDACTED>\b)(?![{[|>]\s*(?:#.*)?$)([^\s#'"{\[\r\n][^\r\n#]*?)(\s*(?:,\s*)?(?:#.*)?)$/gmu, "$1<REDACTED>$3");
  return out.trim() || "# Redacted configuration\n<REDACTED>";
}

type PreparedContextDocumentResult =
  | { reference: ContextReference }
  | { issue: { path: string; reason: string } }
  | { secret_hold: HeldSecretMaterial };

/**
 * One file read in full after the explicit start (no limits, user 2026-10-22): its bytes come from the journey's staging (or are staged
 * first), secret-like files are held before staging extracted text unless explicitly decided by the person (`S-onboarding-secret-hold`),
 * and a file that cannot be read is an issue of its own that never stops the others.
 */
export async function prepareContextDocument(
  home: string,
  journeyId: string,
  kind: ContextSourceKind,
  file: ImportFile,
  signal?: AbortSignal,
  secretDecisions?: Readonly<Record<string, SecretSendDecision>>,
): Promise<PreparedContextDocumentResult> {
  signal?.throwIfAborted();
  try {
    if (file.reason || (file.staged === undefined && file.bytes === undefined)) throw new Error(file.reason || "没有读取到文件");
    const original = file.bytes ? await stageContextUpload(home, journeyId, file.bytes) : null;
    const sha256 = original?.sha256 ?? file.staged!;
    const bytes = file.bytes ?? await readStagedFile(home, journeyId, sha256), filename = file.path.split("/").at(-1)!;
    const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? "";
    const result = await readWholeMaterial({ file_name: filename, bytes }, signal);
    signal?.throwIfAborted();
    if (extension === "pdf" && result.coverage.status !== "sufficient") throw new Error(result.coverage.issues.join("；") || "PDF 没有可读取的文本层");
    const body = result.text.trim();
    if (!body) throw new Error("文件没有可读取的正文");
    const detected = detectMaterialSecret(file.path, body);
    let finalBody = body;
    let secretMode: "strip" | "raw" | undefined;
    if (detected) {
      const sKey = secretMaterialKey(kind, file.path, sha256);
      const decision = secretDecisions?.[sKey];
      if (decision === "exclude") return { issue: { path: file.path, reason: "按你的选择没有发送" } };
      if (decision !== "strip" && decision !== "raw") {
        return {
          secret_hold: {
            key: sKey,
            kind,
            path: file.path,
            filename,
            sha256,
            size_bytes: bytes.length,
            reason: detected.reason,
            preview_names: detected.previewNames,
          },
        };
      }
      secretMode = decision;
      finalBody = decision === "strip" ? stripMaterialSecrets(body) : body;
    }
    const title = [...(result.title || filename.replace(/\.[^.]+$/u, ""))].slice(0, 500).join("");
    const recognizedByContent = isRecognizedByContent(filename);
    return {
      reference: {
        source_id: createHash("sha256").update(JSON.stringify(secretMode ? [kind, file.path, sha256, secretMode] : [kind, file.path, sha256])).digest("hex"),
        version: 1,
        label: "",
        title,
        path: file.path,
        text: await stageContextText(home, journeyId, finalBody),
        original: { filename, mime: MIME[extension] ?? "text/plain", sha256, size_bytes: bytes.length },
        ...(recognizedByContent ? { recognized_by_content: true } : {}),
        ...(secretMode ? { secret_mode: secretMode } : {}),
      },
    };
  } catch (error) {
    signal?.throwIfAborted();
    // A full disk is not this file's fault: the round stops and goes on at this file once there is room.
    if (diskFull(error)) throw error;
    const message = error instanceof Error ? error.message : "无法读取文件";
    // Whole characters, not UTF-16 units: unit 600 can fall inside a two-unit character. The first slice bounds what is spread.
    return { issue: { path: file.path, reason: unreadableReason(error) ?? (/password/iu.test(message) ? "PDF 已加密，请解密后导入" : [...message.slice(0, 1_200)].slice(0, 600).join("")) } };
  }
}
