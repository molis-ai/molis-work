import type { MaterialExtractionOptions, MaterialSource } from "@molis-ai/molis-work-contracts/services/materials";
import { createMaterialExtractor } from "./material-extraction.js";
import type { NativeMaterialOptions } from "./material-native.js";

/** Host configuration only. Plugins receive bytes and choices, never the helper path or the Home directory. */
export interface HomeMaterialOptions extends MaterialExtractionOptions, NativeMaterialOptions {}

/** Existing Host extraction; reading keeps no business record or uploaded copy. */
export async function extractHomeMaterial(_home: string, source: MaterialSource, options: HomeMaterialOptions = {}) {
  const check = async () => { options.signal?.throwIfAborted(); await options.beforeEffect?.(); options.signal?.throwIfAborted(); };
  await check();
  const extract = createMaterialExtractor({ helperPath: options.helperPath ?? process.env.MOLIS_MATERIAL_NATIVE_HELPER,
    platform: options.platform, beforeEffect: options.beforeEffect });
  const result = await extract(source, options);
  await check();
  return result;
}
