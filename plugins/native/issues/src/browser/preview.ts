import { required } from "./dom.js";
import type { IssuesPage, MediaZoom } from "./types.js";

/** The enlarged picture: opened from a thumbnail, zoomed by the shared media-zoom helper, closed by a click beside it. */
export function installPreview(page: IssuesPage): void {
  const { el, L, scope, $ } = page;
  // Media zoom (VUX-32), made on first open; the button says what it does next. Without the helper: fit / own size.
  const view = required<HTMLElement>($("preview"), "[data-issue-picture]");
  const viewed = required<HTMLImageElement>(view, "img");
  let zoom: MediaZoom | null | undefined;
  const fits = () => { if (zoom) $("zoom").hidden = zoom.state() === "fit" && zoom.fitsAtActual(); };
  const zoomer = (): MediaZoom | null => {
    if (zoom === undefined) {
      zoom = globalThis.molisMediaZoom?.(view, viewed, { onChange: (next) => { $("zoom").textContent = next === "fit" ? L("issues.shots.actual-size") : L("issues.shots.fit"); fits(); } }) ?? null;
    }
    return zoom;
  };
  scope.listen(el.root, "click", (event) => {
    const button = (event.target as Element).closest("button");
    if (button?.hasAttribute("data-preview")) {
      const dialog = $<HTMLDialogElement>("preview"), img = required<HTMLImageElement>(dialog, "img"), source = required<HTMLImageElement>(button, "img");
      img.src = source.src;
      img.alt = source.alt;
      delete dialog.dataset.zoom;
      $("zoom").textContent = L("issues.shots.actual-size");
      view.scrollTo(0, 0);
      dialog.showModal();
      zoomer()?.fit(false);
      fits();
    } else if (button?.hasAttribute("data-issue-zoom")) {
      const zoomed = zoomer();
      if (zoomed) { if (zoomed.state() === "fit") zoomed.actual(); else zoomed.fit(); }
      else {
        const on = $("preview").toggleAttribute("data-zoom");
        button.textContent = L(on ? "issues.shots.fit" : "issues.shots.actual-size");
        view.scrollTo(0, 0);
      }
    }
  });
  scope.own(() => zoom?.dispose());
  scope.listen(viewed, "load", fits);
  // A click on the backdrop or beside the picture closes it; a drag that started on the picture does not.
  for (const dialog of el.root.querySelectorAll("dialog")) {
    let down: EventTarget | null = null;
    scope.listen(dialog, "pointerdown", (event) => { down = event.target; });
    scope.listen(dialog, "click", (event) => {
      if (down === event.target && (event.target === dialog || (event.target as Element).matches(".issues-preview-body, [data-issue-picture]"))) dialog.close();
      down = null;
    });
  }
}
