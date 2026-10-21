/**
 * Files the person adds to the next Send (specs/visual-ui-experience §composer-mentions, VUX-16, VUX-18), whether picked,
 * pasted or dropped: one path for all three. Text is read here and sent as the person's own material; a picture or a PDF
 * goes to the Host, which reads it (`POST /api/assistant/attachments`). Until it is in hand a file has a chip of its own on
 * the context strip: 「读取中」 while it is read, then the material in its place (the same chip, keyed by the entry), or,
 * when it cannot be read, its name and why, with 重试 when trying again could help and × to let it go. A failure stays on the
 * strip until the person lets it go: a toast would be gone before it is read. Letting go of a file still being read drops
 * its late answer. Only the counts (five files, four pictures) are said as a toast: they are about the batch, not a file.
 *
 * The island keeps the materials that go with the Send (`files`); this keeps the ones not in hand yet, which never go.
 * `refused` says why a file cannot go before anything is read (other binary files would reach the model as noise). A picture
 * is taken in by the Agent runtime and shown to the model in the round it is sent with; its preview is a data URL (the page's
 * policy shows data images, not blob URLs). A PDF is read by the runtime's own parser (text layer only). `items` are the chips
 * for files not in hand yet, after the materials; `drop` is false when the key is not one of them.
 */
export const ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT = String.raw`(input) => {
  const { L, api, toast, files, take, paint } = input;
  let incoming = [];
  const readBase64 = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  const isImage = (file) => /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|svg)$/i.test(file.name);
  const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isText = (file) => /^text\//.test(file.type) || /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|xml|html?|css|js|mjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|sql|sh|log|ini|toml)$/i.test(file.name);
  const refused = (file) => {
    if (isImage(file)) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return L("只能带 PNG、JPEG、GIF 或 WebP 图片");
      if (file.size > 5 * 1024 * 1024) return L("图片超过 5 MB，请压缩或截取需要的部分");
      return "";
    }
    if (isPdf(file)) return file.size > 8 * 1024 * 1024 ? L("文件超过 8 MB，请只带需要的部分") : "";
    if (!isText(file)) return L("暂时只能读取文本文件、PDF 和图片");
    return file.size > 400000 ? L("文件太大，请只带需要的部分") : "";
  };
  const read = async (file) => {
    if (isImage(file)) {
      const data = await readBase64(file), { material } = await api("/attachments", "POST", { name: file.name, data });
      return { material_id: material.material_id, kind: "image", title: material.title, image: material.image, explicit: true, preview: "data:" + file.type + ";base64," + data };
    }
    if (isPdf(file)) {
      const { material } = await api("/attachments", "POST", { name: file.name, data: await readBase64(file) });
      return { material_id: material.material_id, kind: "file", title: material.title, text: material.text, explicit: true };
    }
    try { return { material_id: "file-" + crypto.randomUUID(), kind: "file", title: file.name, text: await file.text(), explicit: true }; }
    catch { throw new Error(L("读不了这个文件")); }
  };
  const settle = async (entry) => {
    entry.state = "reading"; entry.reason = ""; paint();
    try {
      const material = await read(entry.file);
      if (!incoming.includes(entry)) return;
      incoming = incoming.filter((item) => item !== entry);
      take({ ...material, chip: entry.chip });
    } catch (error) {
      if (!incoming.includes(entry)) return;
      Object.assign(entry, { state: "failed", reason: (error && error.message) || String(error), again: true });
    }
    paint();
  };
  const add = async (chosen) => {
    const started = [];
    for (const file of chosen) {
      const held = files().length + incoming.filter((item) => item.state === "reading").length;
      if (held >= 5) { toast(L("一次最多带 5 个文件")); break; }
      if (isImage(file) && files().filter((item) => item.kind === "image").length + incoming.filter((item) => item.state === "reading" && isImage(item.file)).length >= 4) { toast(L("一次最多带 4 张图片")); continue; }
      const entry = { chip: "in-" + crypto.randomUUID(), file, kind: isImage(file) ? "image" : "file", state: "reading", reason: "", again: false };
      incoming.push(entry);
      const why = refused(file);
      if (why) Object.assign(entry, { state: "failed", reason: why }); else started.push(settle(entry));
    }
    paint();
    await Promise.all(started);
  };
  const find = (key) => incoming.find((entry) => "file:" + entry.chip === key);
  return {
    add,
    items: () => incoming.map((entry) => ({ key: "file:" + entry.chip, label: (entry.kind === "image" ? L("图片") + "：" : "") + entry.file.name, put: true, state: entry.state, note: entry.reason, again: entry.again })),
    reading: () => incoming.some((entry) => entry.state === "reading"),
    drop: (key) => { const entry = find(key); if (entry) incoming = incoming.filter((item) => item !== entry); return Boolean(entry); },
    retry: (key) => { const entry = find(key); if (entry && entry.state === "failed" && entry.again) void settle(entry); },
  };
}`;
