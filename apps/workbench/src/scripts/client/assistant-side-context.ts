/**
 * The Assistant's 上下文 group (specs/visual-ui-experience §assistant-information, VUX-08/09): what the next Send carries
 * (待发送), what the latest round used (本次使用) and what earlier rounds used (历史引用), kept apart so a draft, this
 * execution and an old reference are never read as one another.
 *
 * - 待发送 is what the strip above the input names, read from the island (`pending()`); removing one stays in the strip.
 * - 本次使用 and 历史引用 are the work's own facts: each round's materials and the selection it saw, and the objects the work holds as materials,
 *   each once, under the latest round that used it (a round's materials name their objects). Only an object no round names
 *   (recorded outside a Send) is placed by when it was recorded against the latest round's start. Objects are read again
 *   from their owners (`view.objects`), so one that changed since says so.
 * - The drop zone stays first: dropping or picking a file adds to 待发送.
 */
export const ASSISTANT_SIDE_CONTEXT_FACTORY_SCRIPT = String.raw`({ L, el, kinds, tile, glyph, group, sideAct, paintBlock, keepFocus, current, pending, sidePanelHere, sidePreview,
  readBack, readImage, openObject, objectState, objectTitle, objectDetail, objectGlyph, surfaceName, pickFile, addFiles, expired, block }) => {
  const GLYPH = { image: "image", file: "file", method: "zap", capability: "zap", text: "note", selection: "text", object: "file" };
  const nameOf = (material) => material.title.replace(/^(方法|用|图片|引用)：/, "");
  const objectTile = (object, round) => {
    const state = objectState(object), open = openObject(object);
    const box = el("div", "assistant-tile" + (open ? " is-openable" : "") + (state ? " is-attention" : ""));
    box.append(tile(objectGlyph(object), state ? "attention" : ""));
    if (open) { const name = el("button", "assistant-item-title", object.title); name.type = "button"; name.setAttribute("aria-label", L("打开") + "：" + object.title); name.addEventListener("click", () => { void open(); }); box.append(name); }
    else box.append(el("span", "assistant-item-title", objectTitle(object)));
    box.append(el("span", "assistant-item-sub" + (state ? " is-attention" : ""), [state || surfaceName(object.open && object.open.surface) || L("引用"),
      round ? L("第 {n} 轮").replace("{n}", String(round)) : ""].filter(Boolean).join(" · ")));
    box.title = objectDetail(object);
    return box;
  };
  const materialTile = ({ material, round }) => {
    const box = el("div", "assistant-tile"), name = nameOf(material);
    const readable = material.kind === "file" && material.text && sidePanelHere()
      ? () => { sidePreview({ preview: { title: name, media_type: "text/plain", text: material.text } }); } : readBack(material, name) || readImage(material, name);
    const title = el(readable ? "button" : "span", "assistant-item-title", name);
    if (readable) { title.type = "button"; title.setAttribute("aria-label", L("预览") + "：" + name); box.classList.add("is-openable"); title.addEventListener("click", readable); }
    box.append(tile(GLYPH[material.kind] || "file", ""), title, el("span", "assistant-item-sub", [L(kinds[material.kind] || "材料"),
      round ? L("第 {n} 轮").replace("{n}", String(round)) : "", material.expired ? L("已失效") : ""].filter(Boolean).join(" · ")));
    if (material.expired) box.title = L(expired);
    return box;
  };
  const tiles = (items) => { const box = el("div", "assistant-tiles"); items.forEach((one) => box.append(one)); return box; };
  return { paint() {
    const view = current(), work = view ? view.work : null, rounds = work ? view.rounds : [];
    const latest = rounds.length ? rounds[rounds.length - 1] : null, since = latest ? Date.parse(latest.started_at) : Infinity;
    const objects = work && view.objects ? view.objects.filter((o) => o.relation === "material") : [];
    // Each material once, at the latest round that used it.
    const used = new Map();
    // A round's selection is what it saw of the page, the same as what was handed over; its page object is a material object.
    const seen = (round) => [...(round.materials || []).filter((material) => !material.object),
      ...(round.context && round.context.selection ? [{ kind: "selection", title: L("选中的内容") + "：" + round.context.selection.text.replace(/\s+/g, " ").slice(0, 28) }] : [])];
    rounds.forEach((round, index) => seen(round).forEach((material) => { const key = material.kind + ":" + material.title; used.delete(key); used.set(key, { material, round: index + 1, now: round === latest }); }));
    const at = new Map();
    rounds.forEach((r, i) => (r.materials || []).forEach((m) => m.object && at.set(m.object.kind + ":" + m.object.id, i + 1)));
    const roundOf = (o) => at.get(o.subject.kind + ":" + o.subject.id), usedNow = (o) => roundOf(o) ? roundOf(o) === rounds.length : Date.parse(o.recorded_at) >= since;
    const waiting = pending();
    const now = [...objects.filter(usedNow).map((o) => objectTile(o)), ...[...used.values()].filter((one) => one.now).map((one) => materialTile({ material: one.material }))];
    const before = [...objects.filter((o) => !usedNow(o)).map((o) => objectTile(o, roundOf(o))), ...[...used.values()].filter((one) => !one.now).map(materialTile)];
    const node = block();
    const signature = JSON.stringify([work && work.work_id, sidePanelHere(), waiting.map((one) => one.kind + ":" + one.title),
      objects.map((o) => [o.subject.id, o.state, o.title, o.current_revision, o.recorded_at, roundOf(o)]), [...used.keys()], latest && latest.run_id]);
    if (!node || node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node, () => {
      const zone = el("div", "assistant-drop");
      zone.append(el("p", "assistant-drop-label", L("待发送")));
      const hint = el("div", "assistant-drop-hint");
      hint.append(glyph("upload"), el("span", "", L("拖到这里，或 @ 引用、/ 用能力")), sideAct(L("添加文件"), L("下次发送带上"), async () => { pickFile(); }, false, "secondary"));
      zone.append(hint);
      if (waiting.length) zone.append(tiles(waiting.map((one) => materialTile({ material: one }))));
      zone.addEventListener("dragover", (event) => { if (![...(event.dataTransfer?.types || [])].includes("Files")) return; event.preventDefault(); zone.dataset.dropping = "true"; });
      zone.addEventListener("dragleave", (event) => { if (!zone.contains(event.relatedTarget)) delete zone.dataset.dropping; });
      zone.addEventListener("drop", (event) => { delete zone.dataset.dropping; const dropped = [...(event.dataTransfer?.files || [])]; if (!dropped.length) return; event.preventDefault(); void addFiles(dropped); });
      const content = el("div", "assistant-group-list");
      content.append(zone);
      if (now.length) content.append(group(L("本次使用"), tiles(now)));
      if (before.length) content.append(group(L("历史引用"), tiles(before)));
      const changed = objects.filter((o) => o.state !== "current").length;
      paintBlock(node, L("上下文"), "paperclip", content, changed ? changed + " " + L("项有变化") : waiting.length ? waiting.length + " " + L("项待发送") : now.length + before.length ? String(now.length + before.length) : "", changed > 0);
    });
  } };
}`;
