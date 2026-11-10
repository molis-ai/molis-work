// What every settings page carries for 「能力包」: fetch its program once, when a page shows it (now, or when the settings cover places it).
const load = () => {
  if (!document.querySelector("[data-kit-settings]") || document.querySelector("script[data-kit-client]")) return;
  const script = document.createElement("script");
  script.src = "/assets/molis-work-kit.js";
  script.dataset.kitClient = "";
  document.head.append(script);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
document.addEventListener("molis-work:settings-embed", load);
