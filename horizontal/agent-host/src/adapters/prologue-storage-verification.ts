import { verifyNodeStorageContents } from "@prologue/sdk/node";

export interface PrologueNodeStorageVerificationOptions {
  readonly storageRoot: string;
  readonly keyRoot: string;
  /** The trusted Host's synchronous assertion of its original offline owner window. */
  readonly assertCurrent: () => void;
  readonly signal?: AbortSignal;
}

/** Authenticate the actual archived records under their original keys without a Runtime, model or writable store. */
export function verifyPrologueNodeStorageContents(options: PrologueNodeStorageVerificationOptions): Promise<void> {
  return verifyNodeStorageContents(options);
}
