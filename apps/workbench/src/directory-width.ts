import { accountCachePrefix } from './account-cache-key.js';
/** The directory resizer and first paint use the same bounds. */
export function directoryWidth(value: unknown, viewportWidth: number, immersive: boolean): { minimum: number; maximum: number; width: number } {
  const minimum = immersive ? 200 : 260;
  const maximum = immersive ? Math.min(520, viewportWidth - 360) : Math.min(520, Math.max(320, viewportWidth * 0.48));
  return { minimum, maximum, width: Math.round(Math.min(maximum, Math.max(minimum, Number(value) || 240))) };
}

/** Request-local presentation only: reuse the current session preference before the first workspace paint. */
export function directoryWidthPreferenceScript(projectId: string, collection: "current" | "archive" | "trash", embedded: boolean): string {
  if (!projectId || embedded) return "";
  const key = JSON.stringify("molis-work-ui:" + projectId).replaceAll("<", "\\u003c");
  return `(()=>{if(window.parent!==window&&new URLSearchParams(location.search).has('workbenchPane'))return;
    if(matchMedia('(max-width:600px)').matches)return;
    try{const scope=document.querySelector('meta[name="molis-work-page-session"]')?.content.split('.')[1];
      const key=(scope?(${accountCachePrefix.toString()})(scope):'')+${key},raw=sessionStorage.getItem(key+${JSON.stringify(":" + collection)})${collection === "current" ? "||sessionStorage.getItem(key)" : ""};
      if(!raw)return;const value=JSON.parse(raw)?.treeWidth;if(!value||!Number.isFinite(Number(value)))return;
      const {width}=(${directoryWidth.toString()})(value,innerWidth,true),style=document.createElement('style');
      style.textContent='body.immersive-workbench .immersive-workspace[data-workspace]{--tree-width:'+width+'px}';document.head.append(style);
    }catch{/* Unreadable session preferences follow the normal restore path. */}})();`;
}
