import { parentPort, workerData } from "node:worker_threads";
// Registers the platform's stores in this thread, which shares nothing with the one that started it.
import "./home-storage-lifetime.js";
import { upgradeHomesForMaintenance } from "./upgrade-maintenance.js";

upgradeHomesForMaintenance((workerData as { homes: readonly string[] }).homes, message => parentPort!.postMessage(message));
