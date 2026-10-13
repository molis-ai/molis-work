export type MemoryErrorCode = "memory.invalid" | "memory.not_found" | "memory.forbidden" | "memory.scope" | "memory.limit" | "memory.conflict" | "memory.off";
export class MemoryError extends Error {
  constructor(readonly code: MemoryErrorCode, message: string) { super(message); this.name = "MemoryError"; }
}
