// RAC-110: report the actual server port through IPC, after startup output has been written.
// Leave stdout and HTTP handling untouched so the parent can close the real pipe and check HTTP liveness.
import { Server } from "node:http";

const listen = Server.prototype.listen;
Server.prototype.listen = function(...args) {
  this.once("listening", () => {
    setImmediate(() => process.send?.(this.address().port));
  });
  return listen.apply(this, args);
};
