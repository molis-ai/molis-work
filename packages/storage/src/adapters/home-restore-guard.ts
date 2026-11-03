import { lstatSync } from "node:fs";
import { join } from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** A technical barrier, never evidence that the journal itself is valid. */
export const HOME_RESTORE_JOURNAL = ".molis-home-restore.json";
const errors = defineErrorCodes("storage.owner", { recovery_required: "unavailable" });

/** Every kind of pending node blocks normal startup; only the restore owner interprets its contents. */
export function assertNoPendingHomeRestore(storageDirectory: string): void {
  if (lstatSync(join(storageDirectory, HOME_RESTORE_JOURNAL), { throwIfNoEntry: false })) {
    throw errors.recovery_required("此 Home 有未完成的离线恢复；请保持其他入口关闭并运行 molis-work home restore --recover");
  }
}
