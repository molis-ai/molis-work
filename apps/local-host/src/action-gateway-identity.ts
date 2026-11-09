import { createHash } from "node:crypto";
import { resolveHomeDirectory } from "@molis-ai/molis-work-storage";

/** A Home reached through a link still has the same transport identity. */
export const actionGatewayHomeId = (home: string) => createHash("sha256").update(resolveHomeDirectory(home)).digest("hex");
