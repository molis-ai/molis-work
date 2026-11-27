/* Jelly 瘦身定样的可点原型。一份状态 S，每次动作后整页重画。
   地址参数：?plan=a|b；&do=<状态>；&w=1440|1024|390；&theme=dark；&lang=zh|en|ja；&bare 只留窗口；&still 关动效（截图用）。
   不是产品代码：数据写死，「今天」固定为 2026-11-26 周四 10:20。 */
(() => {
  const K = window.mwKit;
  const $ = (s, r = document) => r.querySelector(s);
  const q = new URLSearchParams(location.search);
  const root = document.documentElement;
  if (q.has("bare")) root.dataset.bare = "";
  if (q.has("still")) root.dataset.still = "";
  let LANG = ["en", "ja"].includes(q.get("lang")) ? q.get("lang") : "zh";
  let W = Number(q.get("w")) || 1440;
  let PLAN = q.get("plan") === "b" ? "b" : "a";
  const t = (zh, en, ja) => (LANG === "en" ? en : LANG === "ja" ? ja : zh);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const I = (n, c = "") => `<svg class="js-i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (o) => K.renderButton({ size: "md", variant: "ghost", ...o });

  /* —— 日期 —— */
  const TODAY = "2026-11-26";
  const at = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const add = (k, n) => { const d = at(k); d.setDate(d.getDate() + n); return key(d); };
  const locale = () => t("zh-CN", "en-US", "ja-JP");
  const fmt = (k, o) => new Intl.DateTimeFormat(locale(), o).format(at(k));
  const md = (k) => fmt(k, { month: "short", day: "numeric" });
  const wdShort = (k) => fmt(k, { weekday: "short" });
  const full = (k) => fmt(k, { month: "long", day: "numeric", weekday: "short" });
  const monthTitle = () => fmt("2026-11-01", { year: "numeric", month: "long" });
  const rel = (k) => (k === TODAY ? t("今天", "Today", "今日") : k === add(TODAY, 1) ? t("明天", "Tomorrow", "明日") : k === add(TODAY, -1) ? t("昨天", "Yesterday", "昨日") : "");

  /* —— 数据 —— */
  const CATS = () => [
    { id: "work", name: t("工作", "Work", "仕事"), c: "var(--hue-blue)" },
    { id: "life", name: t("生活", "Life", "生活"), c: "var(--hue-green)" },
    { id: "study", name: t("学习", "Study", "勉強"), c: "var(--hue-purple)" },
  ];
  const cat = (id) => CATS().find((x) => x.id === id) ?? { name: t("未分类", "Uncategorized", "未分類"), c: "var(--hue-gray)" };
  /* 单次日程/任务与重复系列，展开成当月出现 */
  const ITEMS = () => [
    { id: "i1", kind: "event", title: t("和设计对 Jelly 定样", "Review the Jelly mockup with design", "Jelly のデザイン確認"), cat: "work", d: "2026-11-26", s: "10:00", e: "11:00" },
    { id: "i2", kind: "event", title: t("看牙医", "Dentist", "歯医者"), cat: "life", d: "2026-11-26", s: "14:00", e: "15:00" },
    { id: "i3", kind: "task", title: t("买咖啡豆", "Buy coffee beans", "コーヒー豆を買う"), cat: "life", d: "2026-11-26" },
    { id: "i4", kind: "event", title: t("妈妈生日", "Mom's birthday", "母の誕生日"), cat: "life", d: "2026-11-05", allDay: true },
    { id: "i5", kind: "event", title: t("季度复盘", "Quarterly review", "四半期レビュー"), cat: "work", d: "2026-11-12", s: "14:00", e: "15:30" },
    { id: "i6", kind: "task", title: t("交房租", "Pay rent", "家賃を払う"), cat: "life", d: "2026-11-24", done: true },
    { id: "i7", kind: "event", title: t("上海出差", "Trip to Shanghai", "上海出張"), cat: "work", d: "2026-11-27", end: "2026-11-28", allDay: true },
    { id: "i8", kind: "task", title: t("写月报", "Write the monthly report", "月報を書く"), cat: "work", d: "2026-11-30" },
    { id: "i9", kind: "event", title: t("和小林吃饭", "Dinner with Lin", "林さんと夕食"), cat: "life", d: "2026-11-26", s: "19:00", e: "21:00" },
  ];
  const SERIES = () => [
    { id: "s1", kind: "event", title: t("周会", "Weekly sync", "週次ミーティング"), cat: "work", wd: 1, s: "09:30", e: "10:00" },
    { id: "s2", kind: "event", title: t("羽毛球", "Badminton", "バドミントン"), cat: "life", wd: 3, s: "19:00", e: "20:30" },
    { id: "s3", kind: "event", title: t("日语课", "Japanese class", "日本語レッスン"), cat: "study", wd: 5, s: "19:30", e: "21:00", skip: ["2026-11-27"] },
  ];
  const NOTES = () => [
    { id: "n1", d: "2026-11-26", when: "10:12", text: t("# 周四\n\n- 和设计对完定样：日历只留**月 / 周 / 列表**\n- 牙医改到下午 2 点\n- 晚上和小林吃饭，订 `19:00`\n\n> 记得带医保卡", "# Thursday\n\n- Mockup review done: calendar keeps **month / week / list**\n- Dentist moved to 2 pm\n- Dinner with Lin at `19:00`\n\n> Bring the insurance card", "# 木曜日\n\n- デザイン確認：カレンダーは**月 / 週 / リスト**だけ\n- 歯医者は午後 2 時に変更\n- 夜は林さんと夕食 `19:00`\n\n> 保険証を忘れずに") },
    { id: "n2", d: "", when: t("昨天", "Yesterday", "昨日"), text: t("# 读《原则》\n\n痛苦 + 反思 = 进步。\n\n- 先写下事实，再写感受", "# Reading “Principles”\n\nPain + Reflection = Progress.\n\n- Write the facts first, then the feelings", "# 『PRINCIPLES』を読む\n\n痛み + 内省 = 進歩。\n\n- 事実を先に、気持ちは後で") },
    { id: "n3", d: "2026-11-20", when: md("2026-11-20"), text: t("# 日语第 12 课\n\n- 予約（よやく）预约\n- 確認（かくにん）确认", "# Japanese lesson 12\n\n- 予約 (yoyaku) booking\n- 確認 (kakunin) confirm", "# 第 12 課\n\n- 予約（よやく）\n- 確認（かくにん）") },
    { id: "n4", d: "", when: md("2026-11-18"), text: t("# 羽毛球场地\n\n周三晚上要提前两天在公众号上订。", "# Badminton court\n\nBook Wednesday evenings two days ahead.", "# バドミントンのコート\n\n水曜夜は 2 日前までに予約。") },
  ];
  const firstLine = (s) => s.split("\n")[0].replace(/^#+\s*/, "");
  const snippet = (s) => s.split("\n").slice(1).join(" ").replace(/[#>*`-]/g, "").trim();

  function occurrences(from, to) {
    const out = [];
    for (const it of ITEMS()) {
      const end = it.end ?? it.d;
      for (let k = it.d; k <= end; k = add(k, 1)) if (k >= from && k <= to && !S.deleted.has(it.id)) out.push({ ...it, day: k, repeat: false, done: S.done.has(it.id) ? !it.done : it.done });
    }
    for (const se of SERIES()) for (let k = from; k <= to; k = add(k, 1)) {
      if (at(k).getDay() === se.wd && !(se.skip ?? []).includes(k)) out.push({ ...se, day: k, repeat: true, id: `${se.id}@${k}` });
    }
    return out.filter((o) => !S.filter.size || S.filter.has(o.cat)).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || String(a.s ?? "99").localeCompare(String(b.s ?? "99")));
  }
  const timeOf = (o) => (o.allDay ? t("全天", "All day", "終日") : o.s ? o.s : t("当天", "Any time", "終日"));

  /* —— 状态 —— */
  let S;
  const fresh = () => {
    S = { tab: "calendar", mode: "month", sel: TODAY, filter: new Set(), panel: null, note: "n1", noteMode: "write", toast: null, alert: null, done: new Set(), deleted: new Set(), empty: false, notesEmpty: false, load: "ok", narrowOpen: false, wds: new Set([5]) };
  };
  fresh();

  /* —— 画 —— */
  const narrow = () => W < 600;
  function head() {
    const tabs = `<div class="js-tabs" role="tablist">${[["calendar", "calendar", t("日历", "Calendar", "カレンダー")], ["notes", "note", t("随手记", "Notes", "メモ")]].map(([id, ic, label]) => `<button type="button" role="tab" aria-selected="${S.tab === id}" data-tab="${id}">${I(ic, "s")}<span>${label}</span></button>`).join("")}</div>`;
    if (S.tab === "notes") return `<div class="js-head">${tabs}<span class="js-grow"></span>${btn({ variant: "primary", icon: "plus", label: t("新随手记", "New note", "新しいメモ"), iconOnly: narrow(), attrs: { "data-act": "new-note" } })}</div>`;
    const modes = K.renderToggleGroup ? `<span class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${t("视图", "View", "表示")}">${[["month", t("月", "Month", "月")], ["week", t("周", "Week", "週")], ["list", t("列表", "List", "リスト")]].map(([v, l]) => `<button type="button" class="mw-toggle" aria-pressed="${S.mode === v}" data-mode="${v}">${l}</button>`).join("")}</span>` : "";
    const title = S.mode === "week" ? `${md("2026-11-23")} – ${md("2026-11-29")}` : S.mode === "list" ? t("接下来", "Coming up", "これから") : monthTitle();
    return `<div class="js-head">${tabs}
      <span class="js-hide-narrow" style="width:8px"></span>
      ${btn({ icon: "chevron-left", iconOnly: true, label: t("上一段", "Previous", "前へ"), className: "js-hide-narrow" })}
      <h1>${esc(title)}</h1>
      ${btn({ icon: "chevron-right", iconOnly: true, label: t("下一段", "Next", "次へ"), className: "js-hide-narrow" })}
      ${btn({ label: t("今天", "Today", "今日"), variant: "secondary", attrs: { "data-act": "today" } })}
      <span class="js-grow"></span>
      ${modes}
      ${btn({ variant: "primary", icon: "plus", label: t("新日程", "New event", "新しい予定"), iconOnly: narrow(), attrs: { "data-act": "new" } })}
    </div>
    <div class="js-sub">
      <label class="mw-input-group js-hide-narrow" style="width:220px">${I("search", "s")}<input class="mw-input" type="search" placeholder="${t("搜日程", "Search events", "予定を検索")}"></label>
      <div class="js-chips">${CATS().map((c) => `<button type="button" class="js-chip" style="--c:${c.c}" aria-pressed="${S.filter.has(c.id)}" data-cat="${c.id}"><i class="js-dot"></i>${esc(c.name)}</button>`).join("")}</div>
      <span class="js-grow"></span>
      ${btn({ icon: "tag", label: t("分类", "Categories", "カテゴリ"), iconOnly: narrow() })}
    </div>`;
  }

  function evChip(o) {
    return `<button type="button" class="js-ev" style="--c:${cat(o.cat).c}" ${o.allDay ? "data-allday" : ""} ${o.done ? "data-done" : ""} data-open="${o.id}" title="${esc(o.title)}">${o.kind === "task" ? I(o.done ? "check" : "circle", "s") : o.s ? `<time>${o.s}</time>` : ""}${o.repeat ? "" : ""}<span class="js-cut">${esc(o.title)}</span></button>`;
  }
  function month() {
    const start = "2026-10-26", end = "2026-12-06";
    const occ = occurrences(start, end);
    const wds = Array.from({ length: 7 }, (_, i) => `<div class="js-wd">${wdShort(add(start, i))}</div>`).join("");
    const noteDays = new Set(S.notesEmpty ? [] : NOTES().map((n) => n.d).filter(Boolean));
    let cells = "";
    for (let k = start; k <= end; k = add(k, 1)) {
      const list = occ.filter((o) => o.day === k), cap = narrow() ? 3 : W < 1100 || PLAN === "b" ? 2 : 3;
      cells += `<div class="js-day" ${k.slice(5, 7) !== "11" ? "data-out" : ""} ${k === TODAY ? "data-today" : ""} ${PLAN === "b" && k === S.sel ? "data-sel" : ""} data-day="${k}"><span class="js-dn">${at(k).getDate()}</span>${noteDays.has(k) && PLAN === "b" ? `<span class="js-day-note" title="${t("这天有随手记", "Has a note", "メモあり")}">${I("note", "s")}</span>` : ""}${list.slice(0, cap).map(evChip).join("")}${list.length > cap ? `<span class="js-more">${t(`还有 ${list.length - cap} 项`, `${list.length - cap} more`, `ほか ${list.length - cap} 件`)}</span>` : ""}</div>`;
    }
    return `<div class="js-month">${wds}${cells}</div>`;
  }
  function week() {
    const start = "2026-11-23", days = Array.from({ length: 7 }, (_, i) => add(start, i)), occ = occurrences(start, add(start, 6));
    const y = (hm) => { const [h, m] = hm.split(":").map(Number); return (h - 8 + m / 60) * 44; };
    const hd = `<div class="js-wh"></div>${days.map((k) => `<div class="js-wh" ${k === TODAY ? "data-today" : ""}>${wdShort(k)}<b>${at(k).getDate()}</b></div>`).join("")}`;
    const allday = `<div class="js-allday" style="border-left:0;color:var(--faint);font-size:11px;display:grid;place-items:center">${t("全天", "All day", "終日")}</div>${days.map((k) => `<div class="js-allday">${occ.filter((o) => o.day === k && (o.allDay || !o.s)).map(evChip).join("")}</div>`).join("")}`;
    const ruler = `<div class="js-ruler" style="height:616px">${Array.from({ length: 14 }, (_, i) => `<span style="top:${i * 44}px">${String(8 + i).padStart(2, "0")}:00</span>`).join("")}</div>`;
    const cols = days.map((k) => `<div class="js-col">${occ.filter((o) => o.day === k && o.s && !o.allDay).map((o) => `<div style="position:absolute;top:${y(o.s)}px;height:${Math.max(22, y(o.e) - y(o.s) - 2)}px;left:0;right:0">${evChip(o).replace('class="js-ev"', 'class="js-ev" style="--c:' + cat(o.cat).c + ';position:absolute;inset:0"')}</div>`).join("")}${k === TODAY ? `<div class="js-now" style="top:${y("10:20")}px"></div>` : ""}</div>`).join("");
    return `<div class="js-week">${hd}${allday}${ruler}${cols}</div>`;
  }
  function row(o, showTime = true) {
    const mark = o.kind === "task" ? `<span class="js-check" ${o.done ? "data-on" : ""} data-toggle="${o.id}" role="checkbox" aria-checked="${!!o.done}">${o.done ? I("check", "s") : ""}</span>` : `<span class="js-check" data-event style="--c:${cat(o.cat).c}"></span>`;
    return `<button type="button" class="js-row" ${o.done ? "data-done" : ""} data-open="${o.id}">${mark}${showTime ? `<time>${o.allDay ? t("全天", "All day", "終日") : o.s ? `${o.s}${o.e && !narrow() ? `–${o.e}` : ""}` : t("任务", "Task", "タスク")}</time>` : ""}<span class="js-row-t js-cut">${esc(o.title)}</span>${o.repeat ? `<small>${I("refresh", "s")}</small>` : ""}<small>${esc(cat(o.cat).name)}</small></button>`;
  }
  function agenda() {
    const occ = occurrences(TODAY, add(TODAY, 13));
    const days = [...new Set(occ.map((o) => o.day))].sort();
    return `<div class="js-agenda">${days.map((k) => `<section class="js-ag"><h3>${esc(rel(k) || full(k))}${rel(k) ? `<small>${esc(full(k))}</small>` : ""}</h3>${occ.filter((o) => o.day === k).map((o) => row(o)).join("")}</section>`).join("")}</div>`;
  }
  function mdView(src) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
    let html = "", list = false;
    for (const line of src.split("\n")) {
      if (/^- /.test(line)) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(line.slice(2))}</li>`; continue; }
      if (list) { html += "</ul>"; list = false; }
      if (/^# /.test(line)) html += `<h1>${inline(line.slice(2))}</h1>`;
      else if (/^> /.test(line)) html += `<blockquote>${inline(line.slice(2))}</blockquote>`;
      else if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
    return html + (list ? "</ul>" : "");
  }
  function dayRail() {
    const occ = occurrences(S.sel, S.sel), note = S.notesEmpty ? null : NOTES().find((n) => n.d === S.sel);
    return `<aside class="js-rail">
      <h2>${esc(rel(S.sel) || full(S.sel))}${rel(S.sel) ? `<small>${esc(full(S.sel))}</small>` : ""}</h2>
      <section><p class="js-sec-h">${I("calendar", "s")}${t("日程", "Schedule", "予定")}</p>${occ.length ? occ.map((o) => row(o)).join("") : `<p style="color:var(--muted);margin:4px 10px">${t("这天还没有安排。", "Nothing planned for this day.", "この日の予定はありません。")}</p>`}
        <div class="js-quick" style="margin-top:6px">${I("plus", "s")}<span>${t("在这天加一项，回车保存", "Add to this day, press Enter", "この日に追加（Enter で保存）")}</span></div></section>
      <section><p class="js-sec-h">${I("note", "s")}${t("这天的随手记", "Note for this day", "この日のメモ")}<span class="js-grow"></span>${note ? `<span class="js-save">${t("已保存", "Saved", "保存済み")}</span>` : ""}</p>
        <div class="js-daynote">${note ? `<div class="js-md-view" style="font-size:13px">${mdView(note.text)}</div>` : `<span style="color:var(--faint)">${t("写点什么……支持 Markdown", "Write something… Markdown works", "なにか書く…Markdown 対応")}</span>`}</div></section>
    </aside>`;
  }
  function calendar() {
    if (S.load === "fail") return `<div class="js-center">${K.renderEmpty({ icon: "circle-alert", title: t("日历没打开", "Couldn't open the calendar", "カレンダーを開けませんでした"), body: t("可能是刚才的连接断了。你的日程都还在。", "The connection may have dropped. Your events are safe.", "接続が切れた可能性があります。予定はそのまま残っています。"), action: btn({ variant: "secondary", icon: "refresh", label: t("再试一次", "Try again", "もう一度") }) })}</div>`;
    if (S.empty) return `<div class="js-center">${K.renderEmpty({ icon: "calendar", title: t("日历还是空的", "Your calendar is empty", "カレンダーはまだ空です"), body: t("点一天就能加日程；也可以让助理帮你排，它用的是同一套日历。", "Click a day to add an event, or ask the Assistant — it uses the same calendar.", "日付をクリックして予定を追加できます。アシスタントに頼むこともできます。"), action: btn({ variant: "primary", icon: "plus", label: t("新日程", "New event", "新しい予定"), attrs: { "data-act": "new" } }) })}</div>`;
    const view = S.mode === "week" ? week() : S.mode === "list" ? agenda() : month();
    const alert = S.alert ? `<div class="js-alert">${K.renderAlert(S.alert)}</div>` : "";
    const rail = PLAN === "b" && S.mode !== "list" ? dayRail() : narrow() && S.mode === "month" ? `<aside class="js-rail"><h2>${esc(rel(S.sel) || full(S.sel))}</h2>${occurrences(S.sel, S.sel).map((o) => row(o)).join("")}</aside>` : "";
    return `${alert}<div class="js-body-row"><div class="js-main">${view}</div>${rail}</div>`;
  }
  function notes() {
    if (S.notesEmpty) return `<div class="js-center">${K.renderEmpty({ icon: "note", title: t("还没有随手记", "No notes yet", "メモはまだありません"), body: t("想到什么就记一笔，纯文字或 Markdown 都行；可以挂到某一天，日历上就能看到。", "Jot anything down in plain text or Markdown. Pin it to a day to see it on the calendar.", "テキストや Markdown で気軽にメモ。日付に結びつけるとカレンダーに表示されます。"), action: btn({ variant: "primary", icon: "plus", label: t("新随手记", "New note", "新しいメモ"), attrs: { "data-act": "new-note" } }) })}</div>`;
    const list = NOTES(), cur = list.find((n) => n.id === S.note) ?? list[0];
    const groups = [[t("今天", "Today", "今日"), list.slice(0, 1)], [t("更早", "Earlier", "それ以前"), list.slice(1)]];
    const nlist = `<nav class="js-nlist"><label class="mw-input-group" style="margin:4px 4px 8px">${I("search", "s")}<input class="mw-input" type="search" placeholder="${t("搜随手记", "Search notes", "メモを検索")}"></label>${groups.map(([h, ns]) => `<h3>${h}</h3>${ns.map((n) => `<button type="button" class="js-nrow" aria-current="${n.id === cur.id}" data-note="${n.id}"><b class="js-cut">${esc(firstLine(n.text))}</b><span class="js-cut">${esc(n.when)}${n.d ? ` · ${I("calendar", "s").replace("js-i s", "js-i s")} ${esc(md(n.d))}` : ""} · ${esc(snippet(n.text))}</span></button>`).join("")}`).join("")}</nav>`;
    const write = S.noteMode === "write";
    const body = write ? `<textarea class="js-md-src" spellcheck="false" aria-label="${t("随手记正文", "Note text", "メモ本文")}">${esc(cur.text)}</textarea>` : `<div class="js-md-view">${mdView(cur.text)}</div>`;
    const editor = `<section class="js-editor">
      <div class="js-ebar">${narrow() ? btn({ icon: "chevron-left", iconOnly: true, label: t("返回", "Back", "戻る"), attrs: { "data-act": "note-back" } }) : ""}
        <button type="button" class="js-date-chip" ${cur.d ? "" : "data-none"}>${I("calendar", "s")}${cur.d ? esc(full(cur.d)) : t("挂到某一天", "Pin to a day", "日付に結びつける")}</button>
        <span class="js-grow"></span><span class="js-save">${t("已保存", "Saved", "保存済み")}</span>
        <span class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${t("写或看", "Write or read", "編集・表示")}"><button type="button" class="mw-toggle" aria-pressed="${write}" data-nm="write">${t("写", "Write", "編集")}</button><button type="button" class="mw-toggle" aria-pressed="${!write}" data-nm="read">${t("看", "Read", "表示")}</button></span>
        ${btn({ icon: "trash", iconOnly: true, label: t("删除这篇", "Delete note", "このメモを削除"), attrs: { "data-act": "del-note" } })}
      </div><div class="js-md">${body}</div></section>`;
    return `<div class="js-notes-page" ${S.narrowOpen ? "data-open" : ""}>${nlist}${editor}</div>`;
  }
  function panel() {
    if (!S.panel) return "";
    const p = S.panel, repeat = p.repeat;
    const wds = Array.from({ length: 7 }, (_, i) => add("2026-11-23", i));
    const scope = p.scope ? `<div class="js-scope" role="radiogroup"><b>${t("这是重复日程，改哪些？", "This repeats. Change which ones?", "繰り返しの予定です。どれを変更しますか？")}</b>${[["one", t(`只改这一次（${md(p.d)}）`, `Only this one (${md(p.d)})`, `今回だけ（${md(p.d)}）`)], ["future", t("这次和以后", "This and following", "今回以降")], ["all", t("整个系列", "The whole series", "シリーズ全体")]].map(([v, l], i) => `<label><input type="radio" name="scope" ${i === 0 ? "checked" : ""}> ${l}</label>`).join("")}</div>` : "";
    return `<div class="js-scrim" data-act="close"></div><section class="js-panel" role="dialog" aria-label="${esc(p.heading)}">
      <header><h2>${esc(p.heading)}</h2>${btn({ icon: "x", iconOnly: true, label: t("关闭", "Close", "閉じる"), attrs: { "data-act": "close" } })}</header>
      <div class="js-form">
        <input class="js-title-in" value="${esc(p.title)}" placeholder="${t("要做什么？", "What's happening?", "何をしますか？")}" aria-label="${t("标题", "Title", "タイトル")}">
        <span class="mw-toggle-group" data-slot="toggle-group" role="group"><button type="button" class="mw-toggle" aria-pressed="${p.kind === "event"}">${t("日程", "Event", "予定")}</button><button type="button" class="mw-toggle" aria-pressed="${p.kind === "task"}">${t("任务", "Task", "タスク")}</button></span>
        <div class="js-line">${I("clock")}<span class="js-grow">${t("全天", "All day", "終日")}</span><span class="js-switch" ${p.allDay ? "data-on" : ""}></span></div>
        <div class="js-line" style="padding-left:26px;flex-wrap:wrap"><span class="js-val">${esc(full(p.d))}</span>${p.allDay ? "" : `<span class="js-val">${p.s}</span><span style="color:var(--muted)">→</span><span class="js-val">${p.e}</span>`}</div>
        <div class="js-line">${I("refresh")}<span class="js-grow">${t("重复", "Repeat", "繰り返し")}</span><span class="js-val">${repeat ? t("每周", "Weekly", "毎週") : t("不重复", "Never", "なし")} ${I("chevron-down", "s")}</span></div>
        ${repeat ? `<div class="js-wds" style="padding-left:26px">${wds.map((k, i) => `<button type="button" aria-pressed="${S.wds.has(at(k).getDay())}" data-wd="${at(k).getDay()}">${esc(fmt(k, { weekday: "narrow" }))}</button>`).join("")}</div><div class="js-line" style="padding-left:26px"><span class="js-grow" style="color:var(--ink-soft)">${t("直到", "Until", "終了日")}</span><span class="js-val">${t("一直", "No end", "なし")}</span></div>` : ""}
        <div class="js-line">${I("tag")}<span class="js-grow">${t("分类", "Category", "カテゴリ")}</span><div class="js-chips">${CATS().map((c) => `<button type="button" class="js-chip" style="--c:${c.c}" aria-pressed="${p.cat === c.id}"><i class="js-dot"></i>${esc(c.name)}</button>`).join("")}</div></div>
        <label style="display:grid;gap:6px"><span style="color:var(--ink-soft)">${t("备注", "Notes", "メモ")}</span><textarea class="js-textarea" placeholder="${t("地点、要带什么……", "Where, what to bring…", "場所、持ち物など…")}">${esc(p.note ?? "")}</textarea></label>
        ${scope}
      </div>
      <footer>${p.existing ? btn({ icon: "trash", label: t("删除", "Delete", "削除"), attrs: { "data-act": "delete" } }) : ""}<span class="js-grow"></span>${btn({ variant: "secondary", label: t("取消", "Cancel", "キャンセル"), attrs: { "data-act": "close" } })}${btn({ variant: "primary", label: t("保存", "Save", "保存"), attrs: { "data-act": "save" } })}</footer>
    </section>`;
  }
  function render() {
    const win = $("#win");
    win.style.setProperty("--w", `${W}px`);
    win.style.setProperty("--h", W < 600 ? "844px" : "900px");
    const top = `<div class="js-top"><span class="js-top-tab">${I("home", "s")}${t("个人空间", "Personal", "個人スペース")}</span><span class="js-top-ear">${I("calendar", "s")}Jelly</span></div>`;
    const toast = S.toast ? `<div class="js-toast">${K.renderToast({ message: S.toast, action: { label: t("撤销", "Undo", "元に戻す"), attrs: { "data-act": "undo" } } })}</div>` : "";
    win.innerHTML = `${top}<div class="js-sheet"><div class="js-page">${head()}${S.tab === "notes" ? notes() : calendar()}${panel()}</div>${toast}</div><div></div>`;
    root.lang = LANG;
    syncToggles();
  }
  /* 组件板的分段控件读 .is-current；原型用 aria-pressed 记，画完对齐一次 */
  function syncToggles() { document.querySelectorAll(".mw-toggle").forEach((b) => b.classList.toggle("is-current", b.getAttribute("aria-pressed") === "true")); }

  /* —— 动作 —— */
  const openItem = (id) => {
    const base = id.split("@")[0], se = SERIES().find((x) => x.id === base), it = ITEMS().find((x) => x.id === base) ?? se;
    if (!it) return;
    S.panel = { heading: t("改日程", "Edit event", "予定を編集"), existing: true, title: it.title, kind: it.kind, d: id.includes("@") ? id.split("@")[1] : it.d, s: it.s ?? "09:00", e: it.e ?? "10:00", allDay: !!it.allDay, cat: it.cat, repeat: !!se, scope: !!se, id: base };
    if (se) S.wds = new Set([se.wd]);
    render();
  };
  $("#win").addEventListener("click", (e) => {
    const el = e.target.closest("[data-tab],[data-mode],[data-cat],[data-open],[data-toggle],[data-act],[data-note],[data-nm],[data-day],[data-wd]");
    if (!el) return;
    const d = el.dataset;
    if (d.toggle) { e.stopPropagation(); S.done.has(d.toggle) ? S.done.delete(d.toggle) : S.done.add(d.toggle); return render(); }
    if (d.tab) { S.tab = d.tab; S.panel = null; return render(); }
    if (d.mode) { S.mode = d.mode; return render(); }
    if (d.cat) { S.filter.has(d.cat) ? S.filter.delete(d.cat) : S.filter.add(d.cat); return render(); }
    if (d.open) return openItem(d.open);
    if (d.note) { S.note = d.note; S.narrowOpen = true; return render(); }
    if (d.nm) { S.noteMode = d.nm; return render(); }
    if (d.wd) { const n = Number(d.wd); S.wds.has(n) ? S.wds.delete(n) : S.wds.add(n); return render(); }
    if (d.day && !e.target.closest(".js-ev")) { S.sel = d.day; return render(); }
    switch (d.act) {
      case "new": S.panel = { heading: t("新日程", "New event", "新しい予定"), title: "", kind: "event", d: S.sel, s: "15:00", e: "16:00", allDay: false, cat: "work" }; break;
      case "close": case "save": S.panel = null; break;
      case "delete": S.deleted.add(S.panel?.id); S.toast = t("已删除「" + S.panel.title + "」", `Deleted “${S.panel.title}”`, `「${S.panel.title}」を削除しました`); S.panel = null; break;
      case "undo": S.deleted.clear(); S.toast = null; break;
      case "today": S.sel = TODAY; break;
      case "note-back": S.narrowOpen = false; break;
      case "new-note": S.tab = "notes"; S.notesEmpty = false; break;
      case "del-note": S.toast = t("已删除这篇随手记", "Note deleted", "メモを削除しました"); break;
      default: return;
    }
    render();
  });

  /* —— 状态清单 —— */
  const STATES = {
    month: ["月视图", "这个月一眼看全。分类用颜色区分，任务前有勾；格子放不下写「还有几项」。点日程打开右侧编辑。", () => {}],
    week: ["周视图", "一周按小时排，红线是现在。全天和没定时间的放在顶上一行。", () => { S.mode = "week"; }],
    list: ["列表", "从今天往后两周，按天分组；任务可以直接勾掉。", () => { S.mode = "list"; }],
    new: ["新建", "右侧面板：标题、日程/任务、全天、时间、重复、分类、备注。窄屏从底部升起。去掉了优先级、置顶、完成说明和关联。", () => { S.panel = { heading: t("新日程", "New event", "新しい予定"), title: "", kind: "event", d: TODAY, s: "15:00", e: "16:00", allDay: false, cat: "work" }; }],
    repeat: ["改重复日程", "点开一次重复日程：保存时问只改这次、这次和以后、还是整个系列。", () => openItem("s3@2026-11-20")],
    undo: ["删除后撤销", "删掉不再先弹确认：直接删，工作台底部出提示条，可以撤销。Jelly 自己不再放撤销/重做按钮。", () => { S.deleted.add("i2"); S.toast = t("已删除「看牙医」", "Deleted “Dentist”", "「歯医者」を削除しました"); }],
    conflict: ["别处改过", "这条刚在别处（比如助理）改过：只这一条要重读，别的照常，不锁整个日历。", () => { S.alert = { tone: "warning", state: "conflict", title: t("「看牙医」刚在别处改过", "“Dentist” was just changed elsewhere", "「歯医者」が別の場所で変更されました"), body: t("你这次的修改没有保存。看一眼最新的再改。", "Your change wasn't saved. Take a look at the latest version first.", "今回の変更は保存されていません。最新の内容を確認してください。"), actions: [{ label: t("看最新的", "Show latest", "最新を表示") }] }; }],
    notes: ["随手记·写", "左边列表，右边就是一张纸：直接写 Markdown，停手自动保存。顶上可以挂到某一天。", () => { S.tab = "notes"; }],
    read: ["随手记·看", "切到「看」按 Markdown 排版；不做块编辑器、不做格式工具栏。", () => { S.tab = "notes"; S.noteMode = "read"; }],
    "notes-empty": ["随手记·空", "第一次打开随手记。", () => { S.tab = "notes"; S.notesEmpty = true; }],
    empty: ["日历·空", "第一次打开日历。提一句助理也能排日程（AI 排期交给助理调日历动作）。", () => { S.empty = true; }],
    fail: ["没打开", "读失败时就地说清，可以重试。", () => { S.load = "fail"; }],
  };
  let cur = q.get("do") in STATES ? q.get("do") : "month";
  function go(name) {
    cur = name; const lang = LANG; fresh(); LANG = lang;
    STATES[name][2]();
    $("#step").textContent = STATES[name][0]; $("#say").textContent = STATES[name][1];
    document.querySelectorAll("#states button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === name)));
    render();
  }
  function fit() {
    const avail = Math.min(window.innerWidth - 40, 1440);
    $("#fit").style.setProperty("--z", String(Math.min(1, avail / W)));
  }
  const NOTE = {
    a: [["日历和随手记是两个页签", "各自专心：日历只管排日程，随手记是一张纸。最接近现在的 Jelly，改动最小、最好学。"], ["窄屏日历下面放当天", "390 宽时月格只画色条，点一天，下面列出这天的安排。"], ["随手记可以挂到某一天", "挂上以后在列表里显示日期；日历本身不显示随手记。"]],
    b: [["日历旁边放「当天」", "点哪天，右边就是那天的安排和那天的随手记：一眼看到一天的全貌，像一本日程本。"], ["月格少一行", "右边占了 340 宽，月格每天最多显示 2 项；有随手记的日子角上有个小记号。"], ["随手记页签还在", "没挂日期的随手记、找旧的随手记，仍在「随手记」页签里。"]],
  };
  function notesDoc() { $("#notes").innerHTML = NOTE[PLAN].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join(""); }

  $("#states").innerHTML = Object.entries(STATES).map(([k, v]) => `<button type="button" class="mw-toggle" value="${k}">${v[0]}</button>`).join("");
  $("#states").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) go(b.value); });
  const pressed = (sel, v) => { document.querySelectorAll(`${sel} button`).forEach((b) => b.setAttribute("aria-pressed", String(b.value === String(v)))); syncToggles(); };
  $("#plan").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; PLAN = b.value; pressed("#plan", PLAN); notesDoc(); go(cur); });
  $("#width").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; W = Number(b.value); pressed("#width", W); fit(); go(cur); });
  const setTheme = (v) => { root.dataset.resolvedTheme = v; root.dataset.theme = v; pressed("#theme", v); };
  $("#theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setTheme(b.value); });
  $("#lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; LANG = b.value; pressed("#lang", LANG); go(cur); });
  pressed("#plan", PLAN); pressed("#width", W); pressed("#lang", LANG);
  setTheme(q.get("theme") === "dark" ? "dark" : "light");
  window.addEventListener("resize", fit);
  notesDoc(); fit(); go(cur);
})();
