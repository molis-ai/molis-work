import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

const IDENTITY_FIELDS = ["actor_id", "actor_kind", "authority_source"] as const;

/**
 * What a management entry's decision may say about itself: the conversation it came from. Who decides and through which entry is
 * the Host's to fix (the person on this machine, origin management), so a caller that names either one is refused instead of
 * being read (repository-anti-corruption §9.5 #6; trusted identity comes from the call context, never from input). The structure
 * decision and the event decision share this check, so the two doors of one entry cannot treat an identity differently.
 */
export function managementEvidence(evidence: unknown, code: string): Record<string, unknown> {
  const given = (evidence && typeof evidence === "object" ? evidence : {}) as Record<string, unknown>;
  if (IDENTITY_FIELDS.some(field => Object.hasOwn(given, field))) {
    throw new ActionError(code, "管理入口以本机这个人的身份决定，参数里不能带身份或出处");
  }
  return given;
}

/** A reference the caller gave, when it is a non-blank string; anything else falls back to the Host's default. */
export function evidenceText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
