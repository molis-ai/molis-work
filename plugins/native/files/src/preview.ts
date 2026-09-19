/**
 * What the reader shows for the file in focus.
 *
 * Every non-text outcome is its own state with its own sentence. Collapsing
 * them into one "cannot show this" would leave the user unable to tell a file
 * that is too large from one they are not allowed to read — two problems with
 * completely different answers.
 */

export type FilePreview =
  | { status: "none"; hint: string }
  | { status: "loading"; path: readonly string[] }
  | { status: "text"; path: readonly string[]; text: string }
  | { status: "empty"; path: readonly string[] }
  | { status: "too-large"; path: readonly string[]; bytes: number; limit: number }
  | { status: "binary"; path: readonly string[] }
  | { status: "unsupported"; path: readonly string[] }
  | { status: "missing"; path: readonly string[] }
  | { status: "denied"; path: readonly string[] }
  | { status: "error"; path: readonly string[]; message: string };

/** What the Host reports after trying to read one file. */
export type TextFileReadResult =
  | { outcome: "text"; text: string }
  | { outcome: "empty" }
  | { outcome: "too-large"; bytes: number; limit: number }
  | { outcome: "binary" }
  | { outcome: "unsupported" }
  | { outcome: "missing" }
  | { outcome: "denied" };

export function previewFrom(result: TextFileReadResult, path: readonly string[]): FilePreview {
  switch (result.outcome) {
    case "text":
      // An all-whitespace file is still text; only a zero-length one is empty.
      return result.text.length === 0
        ? { status: "empty", path }
        : { status: "text", path, text: result.text };
    case "empty":
      return { status: "empty", path };
    case "too-large":
      return { status: "too-large", path, bytes: result.bytes, limit: result.limit };
    case "binary":
      return { status: "binary", path };
    case "unsupported":
      return { status: "unsupported", path };
    case "missing":
      return { status: "missing", path };
    case "denied":
      return { status: "denied", path };
  }
}

export const PREVIEW_WAITING_HINT = "这个项目还没有绑定工作目录";
export const PREVIEW_SELECT_HINT = "选一个文件来读";

/** The sentence shown for a preview that has no text to show. */
export function previewMessage(preview: FilePreview): string {
  switch (preview.status) {
    case "none":
      return preview.hint;
    case "loading":
      return "正在读取…";
    case "text":
      return "";
    case "empty":
      return "这个文件是空的";
    case "too-large":
      return `文件太大，读不动（${preview.bytes} 字节，上限 ${preview.limit}）`;
    case "binary":
      return "这不是文本文件";
    case "unsupported":
      return "这个条目不是普通文件，打不开";
    case "missing":
      return "文件不在了";
    case "denied":
      return "没有权限读这个文件";
    case "error":
      return preview.message;
  }
}

/**
 * Whether a snapshot can be captured from this preview.
 *
 * Only real text can be captured. Capturing "empty" would publish a snapshot
 * claiming the file's content is the empty string, which is true only if the
 * read succeeded — and the other states are exactly the ones where it did not.
 */
export function capturable(preview: FilePreview): boolean {
  return preview.status === "text";
}
