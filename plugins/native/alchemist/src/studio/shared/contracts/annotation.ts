import { z } from "zod";
import type { Annotation } from "../../domain/calibration/calibration.js";

export const annotationTargetSchema = z
  .object({
    kind: z.enum(["idea_brief", "lens_report", "pulse_report"]),
    objectId: z.string().min(1),
    revision: z.number().int().min(1),
    blockId: z.string().min(1),
  })
  .strict();

export const createAnnotationSchema = z
  .object({
    target: annotationTargetSchema,
    quotedSnapshot: z.string().trim().min(1).max(2_000),
    comment: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const listAnnotationsQuerySchema = z
  .object({
    kind: z.enum(["idea_brief", "lens_report", "pulse_report"]),
    objectId: z.string().min(1),
    revision: z.coerce.number().int().min(1),
  })
  .strict();

export const annotationParamsSchema = z.object({ id: z.string().min(1) }).strict();

export type AnnotationDto = Annotation;
