/**
 * The real Workbench on an isolated Home for checking P1 by hand (specs/archive/contextual-interaction §10): everything is the
 * product path except the writing model, which is a labelled stand-in that answers after a pause (so a selection can
 * be changed while it waits). The judgment runs on the Home's own TypeSafe connection, or falls back to rules and says so.
 *
 *   pnpm exec tsx scripts/contextual-slice/p1-server.mts --home <isolated home> [--port 4301] [--delay 1500] [--jev-from <home>]
 */
import path from "node:path";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { projectActionAvailability } from "../../apps/local-host/dist/project-action-availability.js";
import { createMolisWorkWebServer } from "../../apps/desktop/launchers/web/server.js";
import { typeSafeCredential } from "../../apps/local-host/src/typesafe-connection.js";

const arg = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const home = arg("--home");
if (!home) throw new Error("需要 --home（隔离的 Home 目录，不要用真实 Home）");
const homeDirectory = path.resolve(home);
const port = Number(arg("--port") ?? 4301);
const delay = Number(arg("--delay") ?? 1500);
// Real Jev without copying a secret anywhere: the key is read in this process from the named Home's own TypeSafe
// connection (with that person's consent) and kept only in this process's memory; it is never printed or written.
const jevFrom = arg("--jev-from");
if (jevFrom) {
  const key = typeSafeCredential(path.resolve(jevFrom), "functions");
  if (!key) throw new Error("--jev-from 指定的 Home 没有可用的 TypeSafe 连接");
  process.env.TYPESAFE_API_KEY = key;
}

const localHost = new MolisWorkLocalHost({
  homeDirectory,
  completeText: async (prompt: string) => {
    await new Promise(resolve => setTimeout(resolve, delay));
    // The writing prompt ends with the selected text; the stand-in only echoes its opening words.
    const selected = prompt.trim().split("\n").at(-1)!.trim().slice(0, 24);
    return `【写作替身·非真实模型】${selected}…`;
  },
  actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, homeDirectory),
});
const server = createMolisWorkWebServer({ homeDirectory, localHost });
server.listen(port, "127.0.0.1", () => console.log(`P1 workbench (writing model is a stand-in; judgment: ${jevFrom ? "Jev" : "this Home's connection, else rules"}): http://127.0.0.1:${port}`));
