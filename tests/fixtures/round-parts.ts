/**
 * A model request a round sent, split into the role's own words (the system text) and what the Host handed it as data
 * (the messages, round materials included). ADH-12: a material says what is so; what follows from it is the role's, said once.
 */
export function roundParts(body: string | object): { role: string; data: string } {
  const wire = (typeof body === "string" ? JSON.parse(body) : body) as { system?: unknown; messages?: unknown };
  return { role: JSON.stringify(wire.system ?? ""), data: JSON.stringify(wire.messages ?? []) };
}
