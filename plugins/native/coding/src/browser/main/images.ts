import type { ComposerMaterial } from "@molis-ai/molis-work-contracts/platform/composer";
import type { ComposerAttachmentState, ComposerHandle, ComposerNotice } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";

/**
 * Pictures in Coding's composer (A3, docs/design/coding-daily-basics scheme A): pasted, dropped or picked, each is kept by the platform
 * as this session's attachment (`POST …/attachments`) and shows on the composer's row of thumbnails with its size and 「已存一份」. A
 * picture over 5 MB is not sent: its row says so and the line above the box offers to shrink it, which puts the smaller copy in its
 * place. When the chosen model is marked as not seeing pictures, the send waits for the person to switch model or send the words
 * alone; nothing is dropped silently. A model with no mark is sent the pictures, and the line says it may not see them (decision 51).
 */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const LIMIT = 5 * 1024 * 1024;
const MAX = 6;

/** What the Host kept for one picture: the round names it by `material_id` and the platform reads it again from `attachment`. */
export interface KeptImage { readonly material_id: string; readonly title: string; readonly media_type: string; readonly byte_length: number; readonly attachment: unknown }

export interface CodingImages {
  readonly accept: string;
  upload(file: File, signal: AbortSignal): Promise<ComposerAttachmentState>;
  /** The pictures among what a send carries, in the strip's order; refs this page did not keep are not pictures. */
  take(materials: readonly ComposerMaterial[]): KeptImage[];
  /** The line above the box about pictures, when there is one: too large, or the chosen model and pictures. */
  notice(composer: ComposerHandle): ComposerNotice | null;
  /** Why a send that carries pictures waits, when it must. */
  waiting(composer: ComposerHandle): string | null;
}

const readBase64 = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** A copy under the limit: encoded again at the same size first, then smaller, a few times at most. */
async function shrink(file: File): Promise<File | null> {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = 1;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
      const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.86));
      if (blob && blob.size <= LIMIT && /^image\/(webp|jpeg)$/.test(blob.type)) {
        const name = file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".jpg");
        return new File([blob], name, { type: blob.type });
      }
      scale *= Math.min(0.9, Math.sqrt(LIMIT / Math.max(blob?.size ?? LIMIT * 2, 1)) * 0.95);
    }
    return null;
  } finally { bitmap.close(); }
}

export function codingImages(page: Page, sessionId: () => string, model: () => { readonly label: string; readonly vision?: boolean } | null,
  sighted: () => { readonly label: string; choose(): void } | null): CodingImages {
  const { readText } = page;
  const kept = new Map<string, KeptImage>(), oversize = new Set<File>();
  let textOnly: ReadonlySet<string> | null = null;
  const size = (bytes: number) => bytes >= 1024 * 1024 ? readText("coding.images.size-mb", { n: Math.round(bytes / 104857.6) / 10 }) : readText("coding.images.size-kb", { n: Math.max(1, Math.round(bytes / 1024)) });
  // A pasted picture comes without a name of its own.
  const named = (file: File) => file.name && file.name !== "image.png" ? file
    : new File([file], readText("coding.images.pasted") + "." + (file.type.split("/")[1] || "png").replace("jpeg", "jpg"), { type: file.type });
  const pictures = (composer: ComposerHandle) => composer.materials().filter(item => item.kind === "attachment" && kept.has(item.ref));
  // The strip's files cross the frame as facts, so a refused picture is still there when one with its name, size, type and time is.
  const tooLarge = (composer: ComposerHandle) => { const on = composer.files(); return [...oversize].filter(file => on.some(one => one.name === file.name && one.size === file.size && one.type === file.type && one.lastModified === file.lastModified)); };
  const choiceFor = (composer: ComposerHandle) => {
    const refs = pictures(composer).map(item => item.kind === "attachment" ? item.ref : "");
    return textOnly && refs.length && refs.every(ref => textOnly!.has(ref));
  };
  return {
    accept: IMAGE_TYPES.join(","),
    async upload(given, signal) {
      const file = named(given);
      if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return { state: "failed", reason: readText("coding.images.only-types") };
      if (file.size > LIMIT) { oversize.add(given); return { state: "failed", reason: readText("coding.images.over-limit", { size: size(file.size) }) }; }
      const answer = await api<{ image: Omit<KeptImage, "material_id"> }>(page, sessionPath(sessionId()) + "/attachments", "POST", { name: file.name, data: await readBase64(file) }, signal);
      const ref = "image-" + crypto.randomUUID();
      kept.set(ref, { material_id: ref, ...answer.image });
      return { state: "attached", ref, title: answer.image.title, meta: readText("coding.images.kept", { size: size(answer.image.byte_length) }) };
    },
    take(materials) {
      // 「不带图发」 holds for the send it was chosen for: the composer takes the pictures off with the words it sent.
      const chosen = textOnly;
      textOnly = null;
      return materials.flatMap(item => item.kind === "attachment" && kept.has(item.ref) && !chosen?.has(item.ref) ? [kept.get(item.ref)!] : []);
    },
    notice(composer) {
      const large = tooLarge(composer);
      if (large.length) {
        const first = large[0]!;
        return { tone: "info", icon: "circle-alert", text: readText("coding.images.too-large", { name: first.name, size: size(first.size) }),
          action: { label: readText("coding.images.shrink"), run: () => void (async () => {
            const smaller = await Promise.all(large.map(file => shrink(file).catch(() => null)));
            const done = large.filter((_, index) => smaller[index]);
            done.forEach(file => oversize.delete(file));
            composer.attach(smaller.filter((file): file is File => Boolean(file)), done);
            if (done.length < large.length) page.refs.composer.refresh();
          })() } };
      }
      const carried = pictures(composer);
      if (!carried.length) return null;
      if (carried.length > MAX) return { tone: "info", icon: "circle-alert", text: readText("coding.images.too-many", { n: MAX }) };
      const chosen = model();
      if (!chosen || choiceFor(composer)) return null;
      if (chosen.vision === false) {
        const other = sighted();
        return { tone: "info", icon: "eye-off", text: readText("coding.images.no-vision", { model: chosen.label }),
          ...(other ? { action: { label: readText("coding.images.use-sighted"), run: () => other.choose() } } : {}),
          ...(other ? { also: { label: readText("coding.images.text-only"), run: () => { textOnly = new Set(carried.map(item => item.kind === "attachment" ? item.ref : "")); page.refs.composer.refresh(); } } }
            : { action: { label: readText("coding.images.text-only"), run: () => { textOnly = new Set(carried.map(item => item.kind === "attachment" ? item.ref : "")); page.refs.composer.refresh(); } } }) };
      }
      if (chosen.vision === undefined) return { tone: "info", icon: "image", text: readText("coding.images.unmarked", { model: chosen.label }) };
      return null;
    },
    waiting(composer) {
      if (tooLarge(composer).length) return readText("coding.images.shrink-first");
      const carried = pictures(composer);
      if (carried.length > MAX) return readText("coding.images.too-many", { n: MAX });
      if (carried.length && model()?.vision === false && !choiceFor(composer)) return readText("coding.images.choose-first");
      return null;
    },
  };
}
