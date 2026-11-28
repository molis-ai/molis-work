import { CHARACTERS_CLIENT_PATH } from "../../characters/client-path.js";

const ensureTerminalScript = (onReady?: () => void) => {
  if ("molisPageTerminal" in globalThis || document.querySelector('script[src$="/desktop/pty-client.js"]')) {
    onReady?.();
    return;
  }
  const pty = document.createElement("script");
  pty.src = "/desktop/pty-client.js";
  pty.addEventListener("load", () => onReady?.(), { once: true });
  pty.addEventListener("error", () => pty.remove(), { once: true });
  document.head.append(pty);
};

// What every settings page carries for Settings › 角色 and 项目设置 › 角色: fetch the role program once, when a page shows it (now, or when the settings
// cover places it); the program mounts itself.
const load = () => {
  if (!document.querySelector("[data-characters]")) return;
  // In a project page the workbench or task role picker may have loaded the program already without pty-client.js (Q-wb2-07).
  const loaded = (globalThis as { molisWorkbenchPluginFactories?: Record<string, (host: object) => void> }).molisWorkbenchPluginFactories?.characters;
  if (loaded || document.querySelector("script[data-characters-client]")) {
    ensureTerminalScript(() => {
      if (document.querySelector("[data-characters]:not([data-characters-mounted])")) loaded?.({});
    });
    return;
  }
  const script = document.createElement("script");
  script.src = CHARACTERS_CLIENT_PATH;
  script.dataset.charactersClient = "";
  script.addEventListener("error", () => script.remove(), { once: true });
  // A role's native runs show in the platform's terminal (PG-053): a settings document without it gets it first.
  if ("molisPageTerminal" in globalThis || document.querySelector('script[src$="/desktop/pty-client.js"]')) { document.head.append(script); return; }
  const terminal = document.createElement("script");
  terminal.src = "/desktop/pty-client.js";
  terminal.addEventListener("load", () => document.head.append(script), { once: true });
  terminal.addEventListener("error", () => terminal.remove(), { once: true });
  document.head.append(terminal);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
document.addEventListener("molis-work:settings-embed", load);
