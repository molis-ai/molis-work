import { inboxClient } from "./client.js";
import type { InboxHost } from "./client.js";

declare const host: InboxHost;
inboxClient(host);
