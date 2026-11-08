import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { readProductEnv, readStorageSpace, resolveHomeDirectory, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { catalogManagementProject, residentManagementActions, upgradeOlderCatalog } from "./management-action-client.js";
import {connectResidentAccount,type ResidentAccountConnection} from "./resident-account-connection.js";
import {NATIVE_SESSION_FILE} from "./personal-native-session.js";
import {WEB_CONTROL_TOKEN_RELATIVE_PATH} from "./web-control-token.js";
import { DEFAULT_RESIDENT_HOST_URL } from "./resident-host-request.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { namedDatabasePath, prepareLocalProjectStorage } from "./project-storage.js";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { bindGoalsManagementActions } from "./goal-callers.js";
import { ensureStandaloneProjectRoot } from "./managed-project-database.js";
import { ensureHomeStorageOwner } from "./home-storage-lifetime.js";
import { preflightMemoryHome } from "./memory/memory-initialization.js";
import { dispatchCliProjectCommand, cliFlagValue as value,
  readCliJsonPayload as payload, printV1Help } from "@molis-ai/molis-work-app-cli";

export interface V1CliOptions {
  localHost?: MolisWorkLocalHost;
  homeDirectory?: string;
  actionServiceUrl?: string;
  signal?: AbortSignal;
}

export async function runV1Cli(args: string[], options: V1CliOptions = {}): Promise<number> {
  const operation = args[0];
  if (!operation || operation === "--help" || operation === "-h") {
    printV1Help();
    return 0;
  }
  // A flag right after a valueless --db would be read as its value and name a database after the flag (`--json`).
  const flagValue = value(args, "--db");
  const location = flagValue?.startsWith("--") ? undefined : namedDatabasePath(flagValue);
  if (!location) throw new Error("Molis Work 命令需要 --db PATH 指明项目数据库；没有默认路径，不会按当前目录猜一个。");
  let home = options.homeDirectory ?? resolveMolisWorkHome();
  const origin=options.actionServiceUrl??readProductEnv("WEB_URL")??DEFAULT_RESIDENT_HOST_URL;
  let connected:ResidentAccountConnection|undefined;
  let allowLocalFallback=!!options.localHost||options.homeDirectory!==undefined;
  const storage = prepareLocalProjectStorage(location, "existing");
  const { databasePath } = storage;
  if(!options.localHost&&databaseInHome(home,databasePath)){
    const required=options.homeDirectory===undefined&&readStorageSpace(home)?.kind!=="personal";
    if(required||existsSync(path.join(home,NATIVE_SESSION_FILE))||existsSync(path.join(home,WEB_CONTROL_TOKEN_RELATIVE_PATH))){
      connected=await connectResidentAccount(home,origin,options.signal,required);home=connected.homeDirectory;
      if(connected.installation)allowLocalFallback=false;
      if(!databaseInHome(home,databasePath))throw new ActionError("actions.scope_mismatch","项目不属于当前安装账号；请显式连接正确账号。");
    }
  }
  const homeDatabase = databaseInHome(home, databasePath);
  if (operation === "init" && !homeDatabase) prepareLocalProjectStorage(databasePath, "create");
  if (storage.status === "missing" && operation !== "init") {
    throw new Error(`Molis Work 数据库不存在: ${databasePath}`);
  }
  const input = payload(args);
  let localHost = options.localHost;
  const ownsLocalHost = !options.localHost;
  let reference = molisWorkHostProjectReference({
    databasePath,
    projectId: String(input.project_id ?? value(args, "--project-id") ?? `database:${databasePath}`),
  });
  let homeProject = false;
  const fallback = () => {
    if(!allowLocalFallback&&homeDatabase)throw new ActionError("actions.service_unavailable","当前账号宿主尚未连接，不能回退匿名业务。");
    if (homeProject || homeDatabase) ensureHomeStorageOwner(localHost ??= createMolisWorkLocalHost({ homeDirectory: home }), home, preflightMemoryHome);
    if (operation === "init" && homeDatabase) prepareLocalProjectStorage(databasePath, "create");
    return bindGoalsManagementActions((localHost ??= createMolisWorkLocalHost()).actionClient(reference), reference, { signal: options.signal });
  };
  try {
    return await withCallId(newCallId(), async () => {
      // Not left to `fallback`: it only takes the lock for a database inside the Home, and the catalog here may belong to a project outside it.
      if (!options.localHost || options.actionServiceUrl) upgradeOlderCatalog(home, () => {
        ensureHomeStorageOwner(localHost ??= createMolisWorkLocalHost({ homeDirectory: home }), home, preflightMemoryHome);
        process.stderr.write("已检查并升级这份 Home 的数据库。\n");
      });
      const project = options.localHost && !options.actionServiceUrl ? undefined : catalogManagementProject(home, databasePath);
      homeProject = Boolean(project);
      if(connected&&!project&&!allowLocalFallback)throw new ActionError("actions.scope_mismatch","当前账号没有登记这个项目，不能回退本地执行。");
      if (project && project.project_id !== reference.project_id) throw new ActionError("actions.scope_mismatch", "管理请求与 Home 登记的项目不匹配");
      if (project) reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      const actions = project ? residentManagementActions({ home, databasePath: project.database_path, projectId: project.project_id,
        origin,controlToken:connected?.controlToken, signal: options.signal, fallback }) : fallback();
      if (!project && operation === "init") await ensureStandaloneProjectRoot(localHost!, reference);
      return dispatchCliProjectCommand(actions, args, input);
    });
  } finally { if (ownsLocalHost) await localHost?.close(); }
}

/** Resolve the existing ancestor too: an alias outside Home can still name a Home database that does not exist yet. */
function databaseInHome(home: string, database: string): boolean {
  const suffix: string[] = [];
  let ancestor = database;
  while (!existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  const target = path.resolve(realpathSync(ancestor), ...suffix);
  const root = resolveHomeDirectory(home);
  const relative = path.relative(root, target);
  return relative === "" || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}
