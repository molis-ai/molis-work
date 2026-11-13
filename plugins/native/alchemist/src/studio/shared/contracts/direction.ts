import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { z } from "zod";

export const createDirectionInputSchema = z
  .object({
    title: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().min(8).max(4_000),
  })
  .strict();

export function deriveDirectionTitle(description: string): string {
  const firstLine = description.trim().split(/\r?\n/, 1)[0] ?? description.trim();
  return cutWithEllipsis(firstLine, 28, { prefixLength: 28 });
}
