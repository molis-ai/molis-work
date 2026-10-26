// RAC-118/119: preload only in the isolated child. Load the real built launcher; inject through public dependency ports.
import { writeFileSync } from "node:fs";
import { Server } from "node:http";
import * as host from "@molis-ai/molis-work-app-local-host";
import { ServerEvents } from "@molis-ai/molis-work-server";

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
  if (mode === "live-sse") {
    // Keep the real IM SSE open at the early stop port; its response-close/final cleanup remain production code.
    const closeEvents = ServerEvents.prototype.close;
    let stopped = false;
    ServerEvents.prototype.close = function() {
      if (!stopped) { stopped = true; return; }
      return closeEvents.call(this);
    };
  }
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
    if (mode === "socket-close-blocked") process.send?.({ type: "closing" });
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
    if (mode === "socket-close-blocked") this.on("connection", socket => {
      // The real fd closes; deliberately withhold its final notification through this public dependency port.
      const emit = socket.emit;
      socket.emit = function(event, ...args) {
        if (event === "close") { observed.socketCloseDropped = true; return false; }
        return emit.call(this, event, ...args);
      };
    });
    if (mode === "live-http") this.on("request", (request, response) => {
      if (request.method !== "POST" || request.url !== "/api/settings/projects") return;
      observed.pendingClosed = false;
      observed.order.push("request_entered");
      request.once("aborted", () => { observed.order.push("request_aborted"); });
      request.once("close", () => { observed.order.push("request_closed"); });
      response.once("close", () => { observed.order.push("response_closed"); observed.pendingClosed = true; });
      request.socket.once("close", () => { observed.order.push("socket_closed"); });
      process.send?.({ type: "pending-request" });
    });
    this.once("listening", () => {
      setImmediate(() => process.send?.({ type: "ready", port: this.address().port }));
    });
    return listen.apply(this, args);
  };
}
