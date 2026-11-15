// What every settings page carries for Work Records: fetch its program once, when a page shows it (now, or when the settings cover places it).
const load = () => {
  if (!document.querySelector("[data-work-records-settings]") || document.querySelector("script[data-work-records-client]")) return;
  const script = document.createElement("script");
  script.src = "/assets/molis-work-work-records.js";
  script.dataset.workRecordsClient = "";
  document.head.append(script);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
else load();
document.addEventListener("molis-work:settings-embed", load);
