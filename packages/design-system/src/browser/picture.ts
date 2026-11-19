import { renderDialog } from "../primitives/overlay.js";

let pictures = 0;
/**
 * One picture larger (`window.molisPicture`): the board's Dialog, named by the picture's title, with the page's zoom on the picture
 * when the page has it (`window.molisMediaZoom`). The composer's thumbnails and a conversation's sent pictures open the same way;
 * closing gives focus back to what opened it. It ships with the composer's program, which every page that shows such pictures loads,
 * and shares its board parts, so the frame's own script does not carry the Dialog's renderers.
 */
export function molisPicture(opener: HTMLElement, picture: { src: string; title: string; close?: string }): void {
  const shell = document.createElement("template");
  shell.innerHTML = renderDialog({ labelledBy: `mw-picture-${++pictures}`, title: picture.title, body: `<div class="mw-picture__view"><img class="mw-picture__image" alt=""></div>`, footer: "", className: "mw-picture", ...(picture.close ? { closeLabel: picture.close } : {}) });
  const dialog = shell.content.firstElementChild as HTMLDialogElement;
  const view = dialog.querySelector<HTMLElement>(".mw-picture__view")!, image = dialog.querySelector("img")!;
  image.src = picture.src; image.alt = picture.title;
  const zoom = window.molisMediaZoom?.(view, image);
  dialog.addEventListener("click", (event) => { if (event.target === dialog || (event.target as Element).closest("[data-dialog-close]")) dialog.close(); });
  dialog.addEventListener("close", () => { zoom?.dispose(); dialog.remove(); if (opener.isConnected) opener.focus({ preventScroll: true }); }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
