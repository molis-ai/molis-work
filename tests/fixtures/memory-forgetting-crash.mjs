// Stop after the production durable decision fsync, before its caller can begin SDK cleanup.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";

const [home, memory_id, version, operation_id] = process.argv.slice(2);
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
await ensureSystemAgentService(host, home).ready;
const original = fs.fsyncSync, root = fs.lstatSync(home);
fs.fsyncSync = function(fd) {
  const result = original(fd), current = fs.fstatSync(fd);
  if (current.isDirectory() && current.ino === root.ino && current.dev === root.dev) {
    const facts = JSON.parse(fs.readFileSync(join(home, "memory-forgetting-v2.json"), "utf8"));
    if (facts.decisions.some(one => one.operation_id === operation_id)) {
      process.stderr.write("forgetting-decision-durable\n");
      process.kill(process.pid, "SIGKILL");
    }
  }
  return result;
};
syncBuiltinESMExports();
try {
  await bindActionClient(host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user",
    permissions: [...MEMORY_PERMISSIONS], memory_operation_id: operation_id }))
    .invoke(memoryActions.change, { action: "remove", memory_id, expected_version: Number(version) });
  throw new Error("the durable decision boundary was not reached");
} finally { await host.close(); }
