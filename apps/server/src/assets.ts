import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";
import { LocalProjectDatabase, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import type { RegisterArtifactVersionInput } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ImError } from "@molis-ai/molis-work-server";

type Asset = Omit<RegisterArtifactVersionInput,"board_id"|"actor_id"|"team_share_authorized"> & {
  owner_actor_id:string;availability:"available"|"unavailable";lifecycle_state:"active"|"archived";source_supersedes_version:number|null;
};
export interface AssetBundle {
  format:"molis-work-assets";version:1;source_project_id:string;title:string;
  goals:unknown[];artifacts:Asset[];
  dependencies:{plugin_id:string;plugin_version:string;credential_required:boolean}[];
  notes:string[];
}
function bundleInput(value: unknown): AssetBundle {
  if (!value || typeof value !== "object") throw new ImError("assets.invalid","不是工作资产包");
  const b=value as AssetBundle;
  if (b.format !== "molis-work-assets" || b.version !== 1 || typeof b.source_project_id !== "string" || !b.source_project_id || b.source_project_id.length > 200 || typeof b.title !== "string" || !Array.isArray(b.artifacts) || b.artifacts.length > 100 || !Array.isArray(b.goals) || b.goals.length > 100 || !Array.isArray(b.dependencies)) throw new ImError("assets.invalid","工作资产包格式无效");
  for (const a of b.artifacts) {
    if (!a || typeof a.owner_actor_id !== "string" || !a.owner_actor_id || !a.producer || !a.content || !["inline","reference"].includes(a.content.kind)) throw new ImError("assets.invalid","成果内容无效");
    // External locations never become filesystem paths or network requests during restore.
    if (a.content.kind === "reference" && (a.content.available !== false || !a.content.content_ref.startsWith("unavailable://"))) throw new ImError("assets.external_reference","外部内容必须保留为未连接引用");
    if (a.supersedes_version !== null) throw new ImError("assets.unsupported_history","资产包未包含完整历史链，不能声称恢复版本历史");
  }
  return b;
}
/** Explicit local restore, never a browser upload. Preserves selected immutable content, not private Home state. */
export async function restoreWorkAssets(value: unknown, directory: string) {
  const bundle=bundleInput(value);
  // Persist the Host-owned recovery identity before creation. The source identifier
  // never becomes a destination filesystem path or an arbitrary catalog identity.
  const snapshotDirectory=join(directory,"continuity");mkdirSync(snapshotDirectory,{recursive:true,mode:0o700});
  const snapshotPath=join(snapshotDirectory,encodeURIComponent(bundle.source_project_id)+".json");
  const initial={source_project_id:bundle.source_project_id,project_id:"project-onboarding-"+randomUUID(),title:bundle.title,goals:bundle.goals,warnings:[]};
  try{writeFileSync(snapshotPath,JSON.stringify(initial,null,2),{flag:"wx",mode:0o600});}
  catch(error){if(!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))throw error;}
  const snapshot=JSON.parse(readFileSync(snapshotPath,"utf8")) as typeof initial;
  if(snapshot.source_project_id!==bundle.source_project_id || !/^project-onboarding-[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(snapshot.project_id))throw new ImError("assets.invalid_destination","目标目录的恢复记录无效");
  const project=await withCatalog({homeDirectory:directory},catalog=>catalog.createProject({project_id:snapshot.project_id,display_name:bundle.title,actor_id:"continuity:local-restore"}));
  const store=new LocalProjectDatabase(project.database_path,{existingOnly:true});
  try {
    const artifacts=new GoalProjectApplication(store).artifacts;
    const restored=store.immediate(()=>bundle.artifacts.map(asset=>{
      const {owner_actor_id,availability,lifecycle_state,source_supersedes_version:_source,...record}=asset;
      const result=artifacts.commands.registerVersion({...record,board_id:project.board_id,actor_id:owner_actor_id,team_share_authorized:record.scope === "team_project"});
      const version={artifact_id:asset.artifact_id,version:asset.version};
      if(availability === "unavailable")artifacts.commands.markUnavailable({board_id:project.board_id,actor_id:owner_actor_id,...version,reason:"原成果不可用，需要重新连接来源"});
      if(lifecycle_state === "archived")artifacts.commands.archiveVersion({board_id:project.board_id,actor_id:owner_actor_id,...version});
      return result;
    }));
    const installedPlugins=new SqlitePluginRuntimeRepository(store.db).list();
    const warnings=[...new Set(bundle.artifacts.filter(a=>!installedPlugins.some(p=>p.plugin_id===a.producer.plugin_id&&p.version===a.producer.plugin_version&&p.state!=="uninstalled"&&p.state!=="quarantined")).map(a=>`此目标项目尚未安装可用插件 ${a.producer.plugin_id}@${a.producer.plugin_version}，固定内容已保留。`)),
      ...bundle.artifacts.filter(a=>a.content.kind === "reference").map(a=>`成果 ${a.artifact_id} v${a.version} 需要重新连接来源；未导入私人凭据。`),
      "目标接续摘要可读取；原项目的完整执行历史、权限和完成验收未迁移。"];
    atomicWriteFileSync(snapshotPath,JSON.stringify({...snapshot,title:bundle.title,goals:bundle.goals,warnings},null,2));
    return {restored:restored.length,project_id:project.project_id,board_id:project.board_id,warnings};
  } finally {store.close();}
}
/** The regular local Host and Artifact browser can read the restored versions. */
export async function readRestoredAssets(directory: string, sourceProjectId: string) {
  const snapshot=JSON.parse(readFileSync(join(directory,"continuity",encodeURIComponent(sourceProjectId)+".json"),"utf8")) as {source_project_id:string;project_id:string;goals:unknown[];warnings:string[]};
  if(snapshot.source_project_id!==sourceProjectId)throw new ImError("assets.invalid_destination","目标目录的来源项目不匹配");
  const project=await withCatalog({homeDirectory:directory},catalog=>catalog.getProject(snapshot.project_id));
  const store=new LocalProjectDatabase(project.database_path,{existingOnly:true});
  try {
    const artifacts=new GoalProjectApplication(store).artifacts.query.listArtifacts(project.board_id);
    return {title:project.display_name,goals:snapshot.goals,artifacts,warnings:snapshot.warnings};
  } finally {store.close();}
}
