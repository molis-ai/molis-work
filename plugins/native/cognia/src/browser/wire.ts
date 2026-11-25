/**
 * Structured skip reason IDs sent between the browser and Host preview route.
 * Displayed to the user through `SKIP_REASON_KEY` in the active UI language.
 */
export const SKIP_REASON = {
  hidden: "hidden",
  unsupported: "unsupported",
  tooLarge: "too_large",
  unreadable: "unreadable",
} as const;

/** The limits Cognia's Host enforces on one import (`COGNIA_LIMITS`); the page applies them before it uploads anything. */
export const UPLOAD_LIMITS = { files: 1000, textBytes: 2_000_000, attachmentBytes: 8_000_000, batchBytes: 32_000_000 } as const;
