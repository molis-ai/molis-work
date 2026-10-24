// RAC-111: loaded only in the disposable server CLI child. Exercise the real launcher and HTTP/SQLite closure,
// injecting a failure at the dependency boundary. No production entry or shutdown handler is replaced.
import { writeFileSync } from "node:fs";
import { Server } from "node:http";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";

const mode = process.env.MOLIS_WORK_TEST_SERVER_CLOSE;
const observed = { transport: 0, storage: 0, storageClosed: false, order: [] };
const failure = phase => Object.assign(new Error(`private shutdown detail /tmp/personal/${phase}`), { code: `server.${phase}_close_failed` });
process.on("exit", () => { writeFileSync(process.env.MOLIS_WORK_TEST_SERVER_REPORT, JSON.stringify(observed)); });

const closeHttp = Server.prototype.close;
Server.prototype.close = function(callback) {
  observed.transport += 1;
  observed.order.push("transport");
  if (mode === "blocked") {
    // Leave the real HTTP listener open and never complete transport cleanup. The parent sends actual OS signals.
    process.send?.("closing");
    return this;
  }
  return closeHttp.call(this, error => {
    // Keep close pending across the second signal: force exit must skip storage and never start cleanup twice.
    setTimeout(() => {
      observed.order.push("transport_done");
      callback(mode === "transport" || mode === "both" ? failure("transport") : error);
    }, 25);
  });
};

const closeStorage = LocalSqliteStorage.prototype.close;
LocalSqliteStorage.prototype.close = function() {
  observed.storage += 1;
  observed.order.push("storage");
  if (mode === "storage" || mode === "both") throw failure("storage");
  closeStorage.call(this);
  observed.storageClosed = !this.db.open;
};

const listen = Server.prototype.listen;
Server.prototype.listen = function(...args) {
  this.once("listening", () => {
    // main's await startServer and listener installation finish before this turn. Emit through the process's real
    // signal listeners to make the pending-close interleaving deterministic, without sending a signal to another PID.
    setImmediate(() => {
      if (mode === "blocked") { process.send?.("ready"); return; }
      process.emit(process.env.MOLIS_WORK_TEST_SERVER_SIGNAL);
      if (process.env.MOLIS_WORK_TEST_SERVER_REPEAT === "yes") {
        process.emit("SIGTERM");
        process.emit("SIGINT");
      }
    });
  });
  return listen.apply(this, args);
};
