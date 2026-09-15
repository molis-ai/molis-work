import type { IncomingMessage } from "node:http";

export const NATIVE_DESKTOP_BOOTSTRAP_SCRIPT = `(()=>{
  const native=Boolean(globalThis.__TAURI_INTERNALS__||globalThis.__TAURI__);
  globalThis.molisWorkNavigationUrl=(value)=>{
    const input=String(value);
    if(!native)return input;
    try{
      const next=new URL(input,location.href);
      if(next.origin!==location.origin)return input;
      next.searchParams.set("desktop","1");
      return next.href;
    }catch{return input}
  };
  if(!native)return;
  globalThis.molisWorkOpenExternalUrl=(url)=>globalThis.__TAURI__.core.invoke("open_external_url",{url});
  document.documentElement.dataset.nativeDesktop="true";
  const root=document.documentElement;
  root.style.setProperty("--desktop-window-safe-inline-start","88px");
  const nativeWindow=globalThis.__TAURI__?.window?.getCurrentWindow();
  if(nativeWindow){
    const syncFullscreen=async()=>{
      try{
        const fullscreen=await nativeWindow.isFullscreen();
        root.dataset.nativeFullscreen=String(fullscreen);
        root.style.setProperty("--desktop-window-safe-inline-start",fullscreen?"2px":"88px");
      }catch(error){console.warn("Molis Work could not read native fullscreen state",error)}
    };
    nativeWindow.onResized(syncFullscreen).then(syncFullscreen).catch((error)=>{
      console.warn("Molis Work could not observe native window resize",error);
    });
  }
  const normalized=globalThis.molisWorkNavigationUrl(location.href);
  if(normalized!==location.href)location.replace(normalized);
})();`;

export function isDesktopShellRequest(request: IncomingMessage, url: URL): boolean {
  const header = request.headers["x-molis-work-desktop"] ?? request.headers["x-goalboard-desktop"];
  if (header === "1" || (Array.isArray(header) && header.includes("1"))) return true;
  return url.searchParams.get("desktop") === "1";
}

export function withDesktopQuery(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (/(?:[?&])desktop=1(?:&|#|$)/.test(href)) return href;
  const hashIndex = href.indexOf("#");
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  return `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}desktop=1${hash}`;
}

export function appendDesktopQueryToLocalHrefs(html: string): string {
  return html.replace(/href="(\/[^\"]*)"/g, (_match, href: string) => `href="${withDesktopQuery(href)}"`);
}

/** Shell ports consumed by the Host's Workbench renderer for both browser and native pages. */
export const desktopWorkbenchRendererPorts = {
  appendDesktopQueryToLocalHrefs,
  withDesktopQuery,
  bootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
};
