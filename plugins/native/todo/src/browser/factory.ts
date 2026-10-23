import { todoClient } from "./client.js";
import type { TodoClientHost } from "./types.js";

/** The bundle's entry. It runs inside the factory `(host) => { … }` that src/client.ts wraps around it, so `host` is the factory's own. */
declare const host: TodoClientHost;
todoClient(host);
