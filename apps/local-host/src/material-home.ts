import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { MaterialExtractionOptions, MaterialSource } from "@molis-ai/molis-work-contracts/services/materials";
import { createMaterialExtractor } from "./material-extraction.js";
import { materialMediaExtensions, type NativeMaterialOptions } from "./material-native.js";
import { materialErrors } from "./material-text.js";

/** Host configuration only. Plugins receive bytes and choices, never helper paths or the Home directory. */
export interface HomeMaterialOptions extends MaterialExtractionOptions, NativeMaterialOptions {}

async function privateDirectory(parent: string, name: string): Promise<string> {
  const directory = path.join(parent, name);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) throw materialErrors.unsafe_storage("素材模型目录无效");
  return directory;
}
async function modelCacheDirectory(home: string): Promise<string> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  return privateDirectory(await privateDirectory(await realpath(home), "lingguang"), "models");
}

/** Existing Host extraction with its existing Home cache; reading keeps no business record or uploaded copy. */
export async function extractHomeMaterial(home: string, source: MaterialSource, options: HomeMaterialOptions = {}) {
  const check = async () => { options.signal?.throwIfAborted(); await options.beforeEffect?.(); options.signal?.throwIfAborted(); };
  await check();
  const modelDirectory = materialMediaExtensions.has(path.extname(source.file_name).toLowerCase()) ? await modelCacheDirectory(home) : undefined;
  await check();
  const extract = createMaterialExtractor({ helperPath: options.helperPath ?? process.env.MOLIS_MATERIAL_NATIVE_HELPER,
    whisperHelperPath: options.whisperHelperPath ?? process.env.MOLIS_MATERIAL_WHISPER_HELPER,
    platform: options.platform, modelDirectory, beforeEffect: options.beforeEffect });
  const result = await extract(source, options);
  await check();
  return result;
}
