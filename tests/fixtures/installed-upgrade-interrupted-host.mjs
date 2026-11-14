import { ChildProcess } from "node:child_process";
import { MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, molisWorkHostProjectReference, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { readFileSync } from "node:fs";

const [homeDirectory, projectId, databasePath, packagePath, phase] = process.argv.slice(2);
const host = new MolisWorkLocalHost({ homeDirectory, completeText: null });
const reference = molisWorkHostProjectReference({ projectId, databasePath });
const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: PLUGIN_INSTALL_PERMISSIONS,
  user_action: { source: "management", conversation_ref: "installed-upgrade", message_ref: "confirm" } };
const client = host.actionClient(reference);
try {
  await host.homePlugins.ready();
  const spawn = ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn = function(options) {
    const result = Reflect.apply(spawn, this, [options]);
    if (options.args.some(arg => arg.endsWith("/project-statement-worker.js"))) {
      let upgrade = false;
      if (phase === "committed") {
        const emit = this.emit;
        this.emit = function(event, ...args) {
          if (event === "message" && upgrade && args[0]?.ok) {
            process.send({ phase, worker: this.pid }, () => process.kill(process.pid, "SIGKILL"));
            return true;
          }
          return Reflect.apply(emit, this, [event, ...args]);
        };
      }
      const send = this.send;
      this.send = function(...args) {
        if (args[0]?.op === "upgrade-home-database") upgrade = true;
        if (phase === "prepared" && args[0]?.publishUpgrade) {
          process.send({ phase: "prepared", worker: this.pid });
          return true; // Hold the SQL Worker at the commit gate until the test kills this Host.
        }
        return Reflect.apply(send, this, args);
      };
    }
    return result;
  };
  const bundle = JSON.parse(readFileSync(packagePath, "utf8"));
  const { preview_id } = await client.invoke(caller, pluginInstallActions.preview, { bundle });
  await client.invoke(caller, pluginInstallActions.confirm, { preview_id, consent: true, pin_label: "Test publisher" });
  throw new Error("The interrupted Host unexpectedly finished its upgrade");
} finally { await host.close(); }
