import path from "node:path";
import type { HomeStoreDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeSqlitePartitionDirectory } from "./home-sqlite.js";

export type { HomeStoreDeclaration };

/** A registered store: the declaration and who owns it (a plugin's id, or the package directory of any other owner). */
export interface HomeStore extends HomeStoreDeclaration {
  readonly owner: string;
}

export interface HomeStoreRegistry<Store extends HomeStore = HomeStore> {
  readonly stores: readonly Store[];
  get(storePath: string): Store | undefined;
  /** Where each store is in `homeDirectory`, in registry order. */
  paths(homeDirectory: string): string[];
  /** The library file of a store that is one: `<home>/<path>/<file>`; of a library partitioned by project, that project's file. */
  libraryPath(homeDirectory: string, store: HomeStore, projectId?: string): string;
}

const SEGMENT = /^[a-z][a-z0-9.-]*$/u;

/**
 * The Home's stores in one place. A path is refused when it is not a plain relative path of one or two segments (the second
 * only under `config/`), when two owners register it, or when one store would lie inside another.
 */
export function homeStoreRegistry<Store extends HomeStore>(stores: readonly Store[]): HomeStoreRegistry<Store> {
  const byPath = new Map<string, Store>();
  for (const store of stores) {
    const segments = store.path.split("/");
    if (!segments.every(segment => SEGMENT.test(segment)) || segments.length > 2 || (segments.length === 2 && segments[0] !== "config")) {
      throw new Error(`Home 存储的路径 ${JSON.stringify(store.path)} 必须是 Home 下的一个名字，或 config/ 下的一个文件`);
    }
    if (store.library && segments.length !== 1) throw new Error(`Home 存储 ${store.path} 是库，库要占一个顶层目录`);
    const taken = byPath.get(store.path);
    if (taken) throw new Error(`Home 存储 ${store.path} 被登记了两次（${taken.owner}、${store.owner}）`);
    byPath.set(store.path, Object.freeze({ ...store }));
  }
  if (byPath.has("config")) throw new Error("config 里还有安装器自己的文件，只能登记其中的单个文件");
  const registered = Object.freeze([...byPath.values()]);
  return {
    stores: registered,
    get: storePath => byPath.get(storePath),
    paths: homeDirectory => registered.map(store => path.join(homeDirectory, ...store.path.split("/"))),
    libraryPath: (homeDirectory, store, projectId) => {
      if ((store.library?.partition === "project") !== (projectId !== undefined)) {
        throw new Error(projectId === undefined ? `库 ${store.path} 按项目分开，要给出项目` : `库 ${store.path} 不按项目分开`);
      }
      const directory = projectId === undefined ? path.join(homeDirectory, store.path) : homeSqlitePartitionDirectory(homeDirectory, store.path, projectId);
      return path.join(directory, store.library?.file ?? `${store.path}.db`);
    },
  };
}
