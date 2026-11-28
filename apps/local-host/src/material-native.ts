import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialExtraction, MaterialExtractionOptions, MaterialLimits, MaterialSource } from "@molis-ai/molis-work-contracts/services/materials";
import { textArgs } from "@molis-ai/molis-work-plugin-sdk/ui";
import { isMaterialFailure, materialErrors, materialFailure } from "./material-text.js";
import { readWorkbenchText } from "./ui-error-words.js";

const run = promisify(execFile);

interface NativeMaterialIssue {
  code: string;
  page?: number | null;
  limit?: number | null;
}

const NATIVE_ERROR_KEYS: Readonly<Record<string, string>> = {
  invalid_file: "workbench.material-native.error.invalid-file",
  file_too_large: "workbench.material-native.error.file-too-large",
  image_too_large: "workbench.material-native.error.image-too-large",
  unsupported_language: "workbench.material-native.error.unsupported-language",
  invalid_image: "workbench.material-native.error.invalid-image",
  invalid_pdf: "workbench.material-native.error.invalid-pdf",
  locked_pdf: "workbench.material-native.error.locked-pdf",
  empty_pdf: "workbench.material-native.error.empty-pdf",
  invalid_arguments: "workbench.material-native.error.invalid-arguments",
  extraction_failed: "workbench.material-native.error.extraction-failed",
};

function localizeNativeIssue(issue: NativeMaterialIssue, locale?: string): string {
  switch (issue.code) {
    case "first_frame_only":
      return readWorkbenchText("workbench.material-native.issue.first-frame-only", locale);
    case "no_readable_text":
      return readWorkbenchText("workbench.material-native.issue.no-readable-text", locale);
    case "pdf_page_limit":
      return readWorkbenchText("workbench.material-native.issue.pdf-page-limit", locale, textArgs({ limit: issue.limit ?? 100 }));
    case "pdf_page_unreadable":
      return readWorkbenchText("workbench.material-native.issue.pdf-page-unreadable", locale, textArgs({ page: issue.page ?? 1 }));
    case "pdf_page_ocr_failed":
      return readWorkbenchText("workbench.material-native.issue.pdf-page-ocr-failed", locale, textArgs({ page: issue.page ?? 1 }));
    case "pdf_page_render_failed":
      return readWorkbenchText("workbench.material-native.issue.pdf-page-render-failed", locale, textArgs({ page: issue.page ?? 1 }));
    case "pdf_page_empty":
      return readWorkbenchText("workbench.material-native.issue.pdf-page-empty", locale, textArgs({ page: issue.page ?? 1 }));
    case "character_limit":
      return readWorkbenchText("workbench.material-native.issue.character-limit", locale, textArgs({ limit: issue.limit ?? 2_000_000 }));
    default:
      return readWorkbenchText("workbench.material-native.issue.unknown", locale);
  }
}

function isNativeIssueEntry(entry: unknown): entry is NativeMaterialIssue {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const candidate = entry as NativeMaterialIssue;
  if (typeof candidate.code !== "string" || candidate.code.length === 0) return false;
  if (candidate.page != null && (!Number.isSafeInteger(candidate.page) || candidate.page <= 0)) return false;
  if (candidate.limit != null && (!Number.isSafeInteger(candidate.limit) || candidate.limit <= 0)) return false;
  return true;
}

/** Trusted Host configuration. The path must never come from an Action input. */
export interface NativeMaterialOptions {
  helperPath?: string;
  platform?: NodeJS.Platform;
  locale?: string;
  beforeEffect?: () => void | Promise<void>;
}
function fail(condition: unknown, raise: (message: string) => ActionError, message: string): asserts condition {
  if (!condition) throw raise(message);
}
function validateNativeResult(raw: unknown, locale?: string): MaterialExtraction {
  fail(raw && typeof raw === "object" && !Array.isArray(raw), materialErrors.invalid_result, readWorkbenchText("workbench.material-native.error.invalid-result", locale));
  const value = raw as MaterialExtraction & { coverage?: MaterialExtraction["coverage"] & { issue_codes?: unknown } };
  const issueCodes = value.coverage?.issue_codes;
  const hasIssueCodes = issueCodes !== undefined;
  const validIssues = Array.isArray(value.coverage?.issues)
    ? value.coverage.issues.every(issue => typeof issue === "string")
    : hasIssueCodes && value.coverage?.issues === undefined;
  fail(
    typeof value.text === "string"
    && value.text.length <= 4_100_000
    && typeof value.extractor === "string"
    && Array.isArray(value.pages)
    && value.pages.length <= 100
    && value.coverage
    && ["sufficient", "partial", "insufficient"].includes(value.coverage.status)
    && Number.isSafeInteger(value.coverage.processed_pages)
    && Number.isSafeInteger(value.coverage.total_pages)
    && value.coverage.processed_pages >= 0
    && value.coverage.total_pages >= value.coverage.processed_pages
    && validIssues
    && (!hasIssueCodes || (Array.isArray(issueCodes) && issueCodes.every(isNativeIssueEntry))),
    materialErrors.invalid_result,
    readWorkbenchText("workbench.material-native.error.invalid-result-coverage", locale),
  );
  for (const page of value.pages) {
    fail(
      page
      && Number.isSafeInteger(page.number)
      && page.number > 0
      && typeof page.text === "string"
      && typeof page.method === "string"
      && (page.confidence == null || (typeof page.confidence === "number" && page.confidence >= 0 && page.confidence <= 1)),
      materialErrors.invalid_result,
      readWorkbenchText("workbench.material-native.error.invalid-result-page", locale),
    );
  }
  for (const page of value.pages) {
    if (page.lines !== undefined) {
      fail(
        Array.isArray(page.lines)
        && page.lines.length <= 100_000
        && page.lines.every(line => line && typeof line.text === "string" && (line.confidence === null || (Number.isFinite(line.confidence) && line.confidence >= 0 && line.confidence <= 1)))
        && page.lines.map(line => line.text).join("\n") === page.text,
        materialErrors.invalid_result,
        readWorkbenchText("workbench.material-native.error.invalid-result-lines", locale),
      );
    }
  }
  const localizedIssues = Array.isArray(issueCodes) && issueCodes.length > 0
    ? (issueCodes as NativeMaterialIssue[]).map(issue => localizeNativeIssue(issue, locale))
    : (value.coverage.issues ?? []);
  const text = value.extractor === "macos-pdfkit-vision"
    ? value.pages
      .filter(page => page.text.length > 0)
      .map(page => `${readWorkbenchText("workbench.material-native.page-marker", locale, textArgs({ page: page.number }))}\n${page.text}`)
      .join("\n\n")
    : value.text;
  return {
    text,
    extractor: value.extractor,
    coverage: {
      status: value.coverage.status,
      processed_pages: value.coverage.processed_pages,
      total_pages: value.coverage.total_pages,
      issues: localizedIssues,
    },
    pages: value.pages.map(page => ({ ...page, confidence: page.confidence ?? null })),
  };
}

function packageHelper(name: string): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.resolve("@molis-ai/molis-work-app-local-host"))), `../native/materials/bin/${name}`);
}
const HELPER = "molis-material";
/** Passive discovery for UI; never starts the helper. */
export function materialImageTextAvailable(native: NativeMaterialOptions = {}): boolean {
  if ((native.platform ?? process.platform) !== "darwin") return false;
  try {
    accessSync(native.helperPath ?? packageHelper(HELPER), constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
export async function extractNativeMaterial(source: MaterialSource, options: MaterialExtractionOptions, limits: MaterialLimits, native: NativeMaterialOptions): Promise<MaterialExtraction> {
  const locale = native.locale;
  options.signal?.throwIfAborted();
  fail((native.platform ?? process.platform) === "darwin", materialErrors.native_unavailable, readWorkbenchText("workbench.material-native.error.macos-required", locale));
  const extension = path.extname(source.file_name).toLowerCase();
  const helper = native.helperPath ?? packageHelper(HELPER);
  try {
    await access(helper, constants.X_OK);
  } catch {
    throw materialErrors.native_unavailable(readWorkbenchText("workbench.material-native.error.helper-not-built", locale));
  }
  options.signal?.throwIfAborted();
  await native.beforeEffect?.();
  options.signal?.throwIfAborted();
  const work = await mkdtemp(path.join(tmpdir(), "molis-material-"));
  try {
    options.signal?.throwIfAborted();
    const input = path.join(work, `source${extension}`);
    await writeFile(input, source.bytes, { mode: 0o600, signal: options.signal });
    await native.beforeEffect?.();
    options.signal?.throwIfAborted();
    const args = ["extract", input];
    if (options.ocrLanguages) args.push("--languages", options.ocrLanguages.join(","));
    const pending = run(helper, args, {
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 20 * 1024 * 1024,
      encoding: "utf8",
      windowsHide: true,
      killSignal: "SIGKILL",
    });
    const closed = new Promise<void>(resolve => pending.child.once("close", () => resolve()));
    // execFile forwards signal to spawn without its killSignal; own cancellation so it cannot hang on SIGTERM.
    const abort = () => { pending.child.kill("SIGKILL"); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const { stdout } = await pending;
      options.signal?.throwIfAborted();
      const result = validateNativeResult(JSON.parse(stdout), locale);
      fail(
        result.text.length <= limits.maxCharacters && Buffer.byteLength(result.text) <= limits.maxTextBytes && result.pages.length <= limits.maxPages,
        materialErrors.output_too_large,
        readWorkbenchText("workbench.material-native.error.output-too-large", locale),
      );
      return result;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (isMaterialFailure(error)) throw error;
      const failure = error as NodeJS.ErrnoException & { stdout?: string; killed?: boolean };
      if (failure.stdout) {
        try {
          const detail = JSON.parse(failure.stdout) as { error?: string; message?: string };
          if (typeof detail.error === "string" && typeof detail.message === "string") {
            const key = Object.hasOwn(NATIVE_ERROR_KEYS, detail.error) ? NATIVE_ERROR_KEYS[detail.error] : undefined;
            const localized = key ? readWorkbenchText(key, locale) : detail.message;
            throw materialFailure(detail.error, localized);
          }
        } catch (parsed) {
          if (isMaterialFailure(parsed)) throw parsed;
        }
      }
      throw failure.killed
        ? materialErrors.timeout(readWorkbenchText("workbench.material-native.error.timeout", locale))
        : materialErrors.extraction_failed(readWorkbenchText("workbench.material-native.error.extraction-failed", locale));
    } finally {
      options.signal?.removeEventListener("abort", abort);
      await closed;
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
