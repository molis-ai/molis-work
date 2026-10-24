// RAC-118/119: preload only in the isolated child. Load the real built launcher; inject through public dependency ports.
import { writeFileSync } from "node:fs";
import { Server } from "node:http";
import * as host from "@molis-ai/molis-work-app-local-host";

const mode = process.env.MOLIS_WORK_TEST_DESKTOP_FAULT;
const observed = { transport: 0, transportClosed: false, host: 0, hostClosed: false, args: [], order: [] };
const failure = () => Object.assign(new Error("desktop-private-details /tmp/personal/argument"), { code: "EIO" });
process.on("exit", () => { writeFileSync(process.env.MOLIS_WORK_TEST_DESKTOP_REPORT, JSON.stringify(observed)); });

if (mode.startsWith("cli-")) {
  // Node's public module mock replaces this one dependency before the product entry imports it; the entry is unchanged.
  // https://nodejs.org/docs/latest-v24.x/api/test.html#mockmodulespecifier-options
  const { mock } = await import("node:test");
  mock.module("@molis-ai/molis-work-app-local-host", { namedExports: { ...host, runLocalCli: async args => {
    observed.args = args;
    if (mode === "cli-reject") throw failure();
    return 7;
  } } });
} else {
  const closeHost = host.MolisWorkLocalHost.prototype.close;
  host.MolisWorkLocalHost.prototype.close = async function() {
    observed.host += 1;
    observed.order.push("host");
    await closeHost.call(this);
    observed.hostClosed = true;
    if (mode === "host-reject") throw failure();
    if (mode === "host-blocked") {
      process.send?.({ type: "closing" });
      await new Promise(() => {}); // The real Host resources already closed; no handle keeps this promise alive.
    }
  };

  let mainServer;
  const closeHttp = Server.prototype.close;
  Server.prototype.close = function(callback) {
    if (this !== mainServer) return closeHttp.call(this, callback);
    observed.transport += 1;
    observed.order.push("transport");
    if (mode === "transport-blocked") {
      process.send?.({ type: "closing" });
      return this; // Leave the real listener alive and never complete its cleanup.
    }
    if (mode === "transport-throw") throw failure();
    return closeHttp.call(this, error => {
      observed.transportClosed = !this.listening;
      observed.order.push("transport_done");
      callback(mode === "transport-reject" ? failure() : error);
    });
  };

  const listen = Server.prototype.listen;
  Server.prototype.listen = function(...args) {
    mainServer = this;
    this.once("listening", () => {
      setImmediate(() => process.send?.({ type: "ready", port: this.address().port }));
    });
    return listen.apply(this, args);
  };
}
