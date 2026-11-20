/**
 * How long each text Images takes may be, in characters (code points, the unit an action schema's `maxLength` counts), after
 * the text is trimmed. One copy for the service's checks and the page's inputs (BL-985): the page lets in exactly what the
 * service accepts. The prompt's limit is also the `jobs.start` schema's `maxLength`.
 */
export const IMAGES_INPUT_LIMITS = {
  prompt: 32_000,
  size: 64,
  aspect_ratio: 32,
  connection_name: 100,
  model: 200,
} as const;
