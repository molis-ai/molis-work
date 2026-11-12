/**
 * The composer's upload for the Assistant (unified-input K3; specs/visual-ui-experience §composer-mentions, VUX-16, VUX-18): a
 * file picked, pasted or dropped on the composer comes here, and the composer's own strip says how it went (读取中, then its name,
 * a picture with its preview, or why it cannot go, with × to let it go; a read the Host could not do throws, so its row offers 重试). Text is read here and sent as the person's own material; a picture or a PDF goes to
 * the Host, which reads it (`POST /api/assistant/attachments`): the runtime takes a picture in and shows it to the model in the round
 * it is sent with, and reads a PDF's text layer with its own parser. `refused` says why a file cannot go before anything is read
 * (other binary files would reach the model as noise).
 *
 * `take` turns what the composer hands over into the Host's materials (implementation-plan §3.3): an attachment is the material
 * read for it; a source's pick is an object reference its owner checks again (`source` shown only, as `capability`). Past five
 * files, or four pictures, the ones over say so on their own rows instead of a toast that would be gone before it is read.
 */
export const ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT = String.raw`({ readText, api }) => {
  const held = new Map();
  const readBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  const isImage = (file) => /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|svg)$/i.test(file.name);
  const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isText = (file) => /^text\//.test(file.type) || /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|xml|html?|css|js|mjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|sql|sh|log|ini|toml)$/i.test(file.name);
  const refused = (file) => {
    if (isImage(file)) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return readText("workbench.assistant-attachments.only-png-jpeg-gif-web-p-images-can");
      if (file.size > 5 * 1024 * 1024) return readText("workbench.assistant-attachments.image-over-5-mb-compress-crop-part-need");
      return "";
    }
    if (isPdf(file)) return file.size > 8 * 1024 * 1024 ? readText("workbench.assistant-attachments.file-over-8-mb-bring-only-part-need") : "";
    if (!isText(file)) return readText("workbench.assistant-attachments.only-text-files-pdfs-images-can-be-read");
    return file.size > 400000 ? readText("workbench.assistant-attachments.file-too-large-bring-only-part-need") : "";
  };
  // A pasted picture comes without a name of its own.
  const named = (file) => file.name && file.name !== "image.png" ? file
    : new File([file], readText("workbench.assistant-composer.pasted-image") + "." + ((file.type.split("/")[1] || "png").replace("jpeg", "jpg")), { type: file.type });
  const read = async (file) => {
    if (isImage(file)) {
      const { material } = await api("/attachments", "POST", { name: file.name, data: await readBase64(file) });
      return { material_id: material.material_id, kind: "image", title: material.title, image: material.image, explicit: true };
    }
    if (isPdf(file)) {
      const { material } = await api("/attachments", "POST", { name: file.name, data: await readBase64(file) });
      return { material_id: material.material_id, kind: "file", title: material.title, text: material.text, explicit: true };
    }
    try { return { material_id: "file-" + crypto.randomUUID(), kind: "file", title: file.name, text: await file.text(), explicit: true }; }
    catch { throw new Error(readText("workbench.assistant-attachments.can-t-read-file")); }
  };
  return {
    accept: ".txt,.md,.markdown,.csv,.tsv,.json,.log,.xml,.yaml,.yml,.html,.htm,.pdf,application/pdf,text/*,image/png,image/jpeg,image/gif,image/webp",
    async upload(file) {
      const one = named(file), why = refused(one);
      if (why) return { state: "failed", reason: why };
      const material = await read(one);
      held.set(material.material_id, material);
      return { state: "attached", ref: material.material_id, title: material.title };
    },
    /** The material read for an attachment's ref, or null: what the side pane's 待发送 names it as (a picture, a file). */
    material: (ref) => held.get(ref) || null,
    take(list) {
      const materials = [], over = [], positions = new Map();
      let count = 0, pictures = 0;
      list.forEach((item, index) => {
        if (item.kind === "material") {
          const { subject, pin } = item.ref;
          materials.push({ material_id: "pick-" + crypto.randomUUID(), kind: "object", title: item.title, explicit: true, reference: item.search ? { hit_id: item.search.hit_id } : { material: item.ref },
            ...(item.search ? { text: item.search.snippet, source: { surface: item.search.plugin_id, plugin_id: item.search.plugin_id, title: item.search.plugin_title } } : {}),
            object: { kind: subject.kind, id: subject.id, title: item.title, ...(pin.mode === "current" ? { version: pin.read_revision } : {}) }, capability: { ...item.source, title: item.title } });
          positions.set(materials.at(-1).material_id, index);
          return;
        }
        const material = held.get(item.ref);
        if (!material) { over.push({ index, reason: readText("workbench.assistant-attachments.can-t-read-file") }); return; }
        count += 1; if (material.kind === "image") pictures += 1;
        if (count > 5) over.push({ index, reason: readText("workbench.assistant-attachments.most-5-files-time") });
        else if (material.kind === "image" && pictures > 4) over.push({ index, reason: readText("workbench.assistant-attachments.most-4-images-time") });
        else { materials.push(material); positions.set(material.material_id, index); }
      });
      return { materials, over, positions };
    },
  };
}`;
