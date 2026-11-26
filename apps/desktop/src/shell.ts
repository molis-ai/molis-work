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
  globalThis.molisWorkPersonalAccountFetch=async(path,options={})=>{
    const result=await globalThis.__TAURI__.core.invoke("personal_account_request",{path,method:options.method||"GET"});
    return new Response(JSON.stringify(result.body),{status:result.status,headers:{"Content-Type":"application/json"}});
  };
  globalThis.molisWorkUiTransport=(input,options)=>{
    const url=new URL(input,location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/personal/')||url.pathname.endsWith('/native-attach')||url.searchParams.has('browser'))return null;
    return globalThis.molisWorkPersonalAccountFetch(url.pathname+url.search,options);
  };
  globalThis.molisWorkOpenExternalUrl=(url)=>globalThis.__TAURI__.core.invoke("open_external_url",{url});
  globalThis.molisWorkOpenShelf=()=>globalThis.molisWorkOpenPlugin?.("shelf");
  globalThis.molisWorkShelfNotice=(message,partial=false,originalWarning=null,notice=null)=>{
    if(typeof CustomEvent!=="function"||typeof window==="undefined"||typeof window.dispatchEvent!=="function")return;
    message=String(message||"");
    const tr=(code,args)=>{
      if(typeof code!=="string"||!/^[a-z0-9-]+$/.test(code)||typeof globalThis.t?.text!=="function")return null;
      const out=globalThis.t.text("workbench.desktop-shelf."+code,args??undefined);
      const miss=globalThis.t.text("common.text.unavailable");
      return out&&out!=="…"&&out!==miss?out:null;
    };
    let display=message;
    if(notice&&typeof notice==="object"){
      const primary=tr(notice.code,notice.args);
      const warn=tr(notice.warning_code);
      if(primary)display=warn?primary+"\\n"+warn:primary;
      else if(warn&&originalWarning&&message.endsWith(originalWarning))display=message.slice(0,-originalWarning.length)+warn;
    }else if(originalWarning&&message.endsWith(originalWarning)){
      const warn=tr("original-not-registered");
      if(warn)display=message.slice(0,-originalWarning.length)+warn;
    }
    window.dispatchEvent(new CustomEvent("molis:shelf-notice",{detail:{message:notice?display:message}}));
    const toast=document.querySelector("[data-settings-toast], [data-toast]");
    if(!toast||!globalThis.molisWorkRequest?.toast)return;
    globalThis.molisWorkRequest.toast(toast,null,display,{ms:5000});
    if(partial===true){toast.setAttribute("data-mw-state","partial");toast.classList.remove("is-error");}
  };
  globalThis.molisWorkShelfRefresh=()=>{
    if(typeof CustomEvent!=="function"||typeof window==="undefined"||typeof window.dispatchEvent!=="function")return;
    window.dispatchEvent(new CustomEvent("molis:shelf-refresh"));
  };
  let lastHostReconnect=0;
  globalThis.molisWorkHostReconnected=()=>{
    const now=Date.now();
    if(now-lastHostReconnect<250)return;
    lastHostReconnect=now;
    if(typeof CustomEvent==="function"&&typeof document!=="undefined"&&typeof document.dispatchEvent==="function"){
      document.dispatchEvent(new CustomEvent("molis-work:attention-refresh",{detail:{reconnected:true}}));
    }
    void globalThis.molisWorkRefreshShelfPreferences?.();
    globalThis.molisWorkShelfRefresh?.();
  };
  globalThis.__TAURI__?.event?.listen?.("molis:host-reconnected",()=>{globalThis.molisWorkHostReconnected?.();})?.catch?.(()=>{});
  const shelfPanel=()=>{
    const tab=document.body.dataset.sideOpen==="true"&&document.querySelector('[data-side-tabs] [data-side-plugin^="shelf/"][aria-selected="true"]');
    const box=tab&&document.getElementById(tab.getAttribute("aria-controls"))?.getBoundingClientRect();
    return box&&box.width>0&&box.height>0?{x:box.left,y:box.top,width:box.width,height:box.height}:null;
  };
  let notifying=0;
  const notifyShelfSurface=()=>{
    if(notifying)return;
    notifying=requestAnimationFrame(()=>{
      notifying=0;
      try{
        globalThis.__TAURI__?.core?.invoke("shelf_surface_changed",{panel:shelfPanel(),language:document.documentElement.lang,theme:document.documentElement.dataset.resolvedTheme}).catch(()=>{});
      }catch{/* Ignore transient Tauri bridge invoke failure while notifying shelf geometry. */}
    });
  };
  const watchShelfSurface=()=>{
    if(!document.body||window.top!==window)return;
    new MutationObserver(notifyShelfSurface).observe(document.body,{attributes:true,attributeFilter:["data-side-open"]});
    new MutationObserver(notifyShelfSurface).observe(document.documentElement,{attributes:true,attributeFilter:["lang","data-resolved-theme"]});
    const panel=document.getElementById("side-panel");
    if(panel){
      const tabs=document.querySelector("[data-side-tabs]");if(tabs)new MutationObserver(notifyShelfSurface).observe(tabs,{subtree:true,attributes:true,attributeFilter:["aria-selected"]});
      new ResizeObserver(notifyShelfSurface).observe(panel);
      panel.addEventListener("transitionend",notifyShelfSurface);
    }
    addEventListener("resize",notifyShelfSurface);
    notifyShelfSurface();
  };
  if(document.body)watchShelfSurface();
  else if(typeof document.addEventListener==="function")document.addEventListener("DOMContentLoaded",watchShelfSurface);
  document.documentElement.dataset.nativeDesktop="true";
  const root=document.documentElement;
  root.style.setProperty("--desktop-window-safe-inline-start","88px");
  const nativeWindow=globalThis.__TAURI__?.window?.getCurrentWindow();
  if(nativeWindow?.label==="main" && window.top===window){
    const startShelfPreferences=()=>{
      const invoke=settings=>globalThis.__TAURI__.core.invoke("shelf_sync_device_preferences",{settings});
      if(document.body.hasAttribute("data-account-entry")){void invoke(null).catch(()=>{});return;}
      let revision, connection, retry, running, stopped=false;
      const api="/api/platform/shelf";
      const stop=()=>{connection?.abort();clearTimeout(retry);};
      const watch=async()=>{
        stop();
        if(stopped||globalThis.molisWorkAccountTransition?.preparing)return;
        const session=new AbortController(), signal=session.signal;
        connection=session;
        const read=async(info)=>{
          if(signal.aborted||revision===info.revision)return;
          const {values}=await globalThis.molisWorkRequest(api+"/preferences/read",{method:"POST",body:{keys:["shelf.hotkeys","shelf.drop_wheel"]},signal});
          const hotkeys=values.find(item=>item.key==="shelf.hotkeys"&&item.state==="ok");
          const wheel=values.find(item=>item.key==="shelf.drop_wheel"&&item.state==="ok");
          if(signal.aborted)return;
          if(!hotkeys||typeof wheel?.value!=="boolean")throw new Error("Shelf preferences unavailable");
          await invoke({hotkeys:hotkeys.value,drop_wheel_enabled:wheel.value});if(!signal.aborted)revision=info.revision;
        };
        const next=async(after)=>{
          try{
            const info=await globalThis.molisWorkRequest(api+"/view-revision"+after,{signal});
            if(signal.aborted)return;
            running=read(info);await running;
            if(!signal.aborted)void next("?after="+encodeURIComponent(revision));
          }catch(error){
            if(signal.aborted)return;
            if([401,403,404,503].includes(error.status)){revision=undefined;await invoke(null).catch(()=>{});}
            if(!signal.aborted)retry=setTimeout(watch,3000);
          }
        };
        return next("");
      };
      globalThis.molisWorkRefreshShelfPreferences=async()=>{stop();await running?.catch(()=>{});if(!stopped)await watch();};
      addEventListener("pagehide",()=>{stopped=true;stop();},{once:true});
      globalThis.molisWorkAccountTransition?.page(document.body,async()=>{stop();},async()=>{stopped=true;stop();await running?.catch(()=>{});await invoke(null);},()=>{revision=undefined;void watch();});
      void watch();
    };
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startShelfPreferences,{once:true});else startShelfPreferences();
  }
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
  const header = request.headers["x-molis-work-desktop"];
  if (header === "1" || (Array.isArray(header) && header.includes("1"))) return true;
  return url.searchParams.get("desktop") === "1";
}

export function withDesktopQuery(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/assets/")) return href;
  if (/(?:[?&])desktop=1(?:&|#|$)/.test(href)) return href;
  const hashIndex = href.indexOf("#");
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  return `${beforeHash}${beforeHash.includes("?") ? "&" : "?"}desktop=1${hash}`;
}

export function appendDesktopQueryToLocalHrefs(html: string): string {
  return html.replace(/href="(\/[^\"]*)"/g, (_match, href: string) => `href="${withDesktopQuery(href)}"`);
}

/**
 * Stable `workbench.desktop-shelf.*` keys resolved by `molisWorkShelfNotice` when native Rust
 * commands send structured `ShelfNoticeCode` payloads (kept server-side so browser bytes stay lean).
 */
export const DESKTOP_SHELF_NOTICE_KEYS = [
  "workbench.desktop-shelf.original-not-registered",
  "workbench.desktop-shelf.batch-partial-failed",
  "workbench.desktop-shelf.folder-too-large",
  "workbench.desktop-shelf.no-items-to-process",
  "workbench.desktop-shelf.action-failed",
  "workbench.desktop-shelf.add-failed",
  "workbench.desktop-shelf.service-unreachable",
  "workbench.desktop-shelf.file-read-failed",
  "workbench.desktop-shelf.folder-read-failed",
  "workbench.desktop-shelf.invalid-filename",
  "workbench.desktop-shelf.busy",
  "workbench.desktop-shelf.no-browser",
  "workbench.desktop-shelf.no-browser-hotkey",
  "workbench.desktop-shelf.need-accessibility",
  "workbench.desktop-shelf.need-accessibility-retry",
  "workbench.desktop-shelf.need-browser-automation",
  "workbench.desktop-shelf.browser-no-url",
  "workbench.desktop-shelf.browser-show-address-bar",
  "workbench.desktop-shelf.files-self",
  "workbench.desktop-shelf.files-browser",
  "workbench.desktop-shelf.files-need-accessibility",
  "workbench.desktop-shelf.files-need-finder",
  "workbench.desktop-shelf.files-empty-finder",
  "workbench.desktop-shelf.files-empty",
] as const;

/** Shell ports consumed by the Host's Workbench renderer for both browser and native pages. */
export const desktopWorkbenchRendererPorts = {
  appendDesktopQueryToLocalHrefs,
  withDesktopQuery,
  bootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
};
