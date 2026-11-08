// Takes a Home's lock in a thread, says so, waits to be told, and gives it back: the first thing §4.2 of the design asks to have shown.
import { parentPort, workerData } from "node:worker_threads";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";

const owner = acquireStorageOwner(workerData.lock);
parentPort.postMessage("held");
parentPort.once("message", () => { owner.release(); parentPort.postMessage("released"); });
