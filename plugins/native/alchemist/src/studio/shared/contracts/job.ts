import { z } from "zod";

export const jobEventsParamsSchema = z.object({ id: z.string().min(1) }).strict();
export const jobEventsQuerySchema = z
  .object({
    after: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();

export interface JobEventDto {
  jobId: string;
  sequence: number;
  type: string;
  payload: unknown;
  createdAt: string;
}
