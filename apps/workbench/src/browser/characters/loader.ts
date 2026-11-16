// What every settings page carries for Settings › 角色 and 项目设置 › 角色: fetch the role program once, when a page shows it (now, or when the settings
// cover places it); the program mounts itself.
const load = () => {
  if (!document.querySelector("[data-characters]:not([data-characters-mounted])") || document.querySelector("script[data-characters-client]")) return;
  // In a project page the workbench may have loaded the program already.
  const loaded = (globalThis as { molisWorkbenchPluginFactories?: Record<string, (host: object) => void> }).molisWorkbenchPluginFactories?.characters;
  if (loaded) { loaded({}); return; }
  const script = document.createElement("script");
  script.src = "/assets/molis-work-plugins/characters.js";
  script.dataset.charactersClient = "";
  // A role's native runs show in the platform's terminal (PG-053): a settings document without it gets it first.
  if (document.querySelector('script[src$="/desktop/pty-client.js"]')) { document.head.append(script); return; }
  const terminal = document.createElement("script");
  terminal.src = "/desktop/pty-client.js";
  terminal.addEventListener("load", () => document.head.append(script), { once: true });
  document.head.append(terminal);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
document.addEventListener("molis-work:settings-embed", load);
