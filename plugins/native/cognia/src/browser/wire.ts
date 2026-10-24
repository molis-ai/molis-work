/**
 * The reasons a file is left out of a preview, as the Host records them. The Host keeps this exact text in the preview and the
 * person reads it translated by that text (Cognia's `en.ts`), so these four are wire values, not page words.
 */
export const SKIP_REASON = {
  hidden: "隐藏或缓存目录",
  unsupported: "暂不支持此文件类型",
  tooLarge: "超过文件或批次大小限制",
  unreadable: "读取失败",
} as const;

/** The limits Cognia's Host enforces on one import (`COGNIA_LIMITS`); the page applies them before it uploads anything. */
export const UPLOAD_LIMITS = { files: 1000, textBytes: 2_000_000, attachmentBytes: 8_000_000, batchBytes: 32_000_000 } as const;
