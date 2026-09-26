export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-server", packagePath: "server",
  kind: "foundation", maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2"], ssot: "docs/SSOT-MATRIX.md",
} as const;

export { openServerDatabase, transaction } from "./database.js";
export type { ServerDatabase } from "./database.js";
export { Identity, memberClientId } from "./identity.js";
export type { Session, Member, Role } from "./identity.js";
export { ServerEvents } from "./events.js";
export { ContinuityService, progressInput } from "./continuity/service.js";
export { CONTINUITY_ACTIONS } from "./continuity/actions.js";
export type { ActionFactory, ProjectScope, ProgressCommand } from "./continuity/types.js";
export { ImError } from "./errors.js";
export type { ServerOptions } from "./http.js";
export { startServer, createServerRequestHandler } from "./http.js";

export { createImDomain } from "./im/index.js";
export type { ImDomainOptions, ImIdentity, ImEvents, ImRequest } from "./im/types.js";
