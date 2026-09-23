import { z } from "zod";

export const createDirectionInputSchema = z
  .object({
    title: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().min(8).max(4_000),
  })
  .strict();

export const directionIdParamsSchema = z.object({ id: z.string().min(1) }).strict();

export function deriveDirectionTitle(description: string): string {
  const firstLine = description.trim().split(/\r?\n/, 1)[0] ?? description.trim();
  return firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
}
