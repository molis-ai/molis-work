import { namedDatabasePath, prepareLocalProjectStorage } from "./project-storage.js";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { dispatchCliProjectCommand, cliFlagValue as value,
  readCliJsonPayload as payload, printV1Help } from "@molis-ai/molis-work-app-cli";

export interface V1CliOptions {
  localHost?: MolisWorkLocalHost;
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
  const storage = prepareLocalProjectStorage(location, operation === "init" ? "create" : "existing");
  const { databasePath } = storage;
  if (storage.status === "missing") {
    throw new Error(`Molis Work 数据库不存在: ${databasePath}`);
  }
  const input = payload(args);
  const localHost = options.localHost ?? createMolisWorkLocalHost();
  const ownsLocalHost = !options.localHost;
  const reference = molisWorkHostProjectReference({
    databasePath,
    projectId: String(input.project_id ?? value(args, "--project-id") ?? `database:${databasePath}`),
  });
  const client = localHost.client(reference);
  try {
    return await dispatchCliProjectCommand(client, args, input);
  } finally {
    if (ownsLocalHost) await localHost.close();
  }
}
