import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginHomeSnapshotSchema, pluginManifestDigest, readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath, inspectSnapshotSqlite, readStorageSpace, type SqliteSnapshotOptions } from "@molis-ai/molis-work-storage";
import { HOME_PLUGIN_RUNTIME_HOME_STORE } from "./home-plugin-store.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { homeSnapshotErrors } from "./home-store-snapshot.js";

interface Library {plugin_id:string; publisher_signature:string; store_name:string; version:number; schema_digest:string}

/** Only a retained, signed package can supply sandbox DDL. The owner of the original Home keeps its software during restore. */
function retainedSchema(home:string, library:Library):string | undefined {
  if (!/^ed25519:sha256:[0-9a-f]{64}$/u.test(library.publisher_signature)) return undefined;
  const file = homeSqlitePath(home,HOME_PLUGIN_RUNTIME_HOME_STORE.path);
  if (!lstatSync(file,{throwIfNoEntry:false})) return undefined;
  let current:PluginInstanceRecord | undefined;
  inspectSnapshotSqlite(file,{baseline:HOME_PLUGIN_RUNTIME_HOME_STORE.library!.baseline,requireSpace:true,space:readStorageSpace(home) ?? undefined,inspect(db){
    const rows = readPluginRuntimeRecords(db).filter(row => row.plugin_id === library.plugin_id);
    if (rows.length > 1) throw homeSnapshotErrors.invalid("安装库没有唯一的 Runtime 身份");
    current = rows[0]; return {};
  }});
  if (!current || current.state === "uninstalled") return undefined;
  if (current.publisher_signature !== library.publisher_signature) throw homeSnapshotErrors.invalid("安装库账本与当前发布者不符");
  if (current.publisher_trust !== "pinned" || current.execution !== "sandbox") return undefined;
  const manifest = new SandboxPackageStore(home).snapshotManifest(current.plugin_id,current.publisher_signature,current.version);
  if (!manifest) return undefined;
  const declaration = manifest.databases?.home;
  if (pluginManifestDigest(manifest) !== current.manifest_digest || !declaration || declaration.store_name !== library.store_name
    || declaration.version !== library.version || createHash("sha256").update(declaration.schema).digest("hex") !== library.schema_digest)
    throw homeSnapshotErrors.invalid("留存签名发行包与 Runtime 或安装库账本不符");
  return declaration.schema;
}

export function installedSnapshotOptions(home:string, library:Library): SqliteSnapshotOptions {
  return {requireSpace:true,version:library.version,inspect(db) {
    const schema = retainedSchema(realpathSync(home),library);
    if (schema !== undefined) {
      const rows = db.prepare("SELECT sql FROM sqlite_schema WHERE type IN ('table','index') AND sql IS NOT NULL AND name <> 'molis_storage_space' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").all() as {sql:string}[];
      assertPluginHomeSnapshotSchema(schema,rows.map(row=>row.sql));
    }
    return {publisher_signature:library.publisher_signature,declaration_sha256:library.schema_digest};
  }};
}
