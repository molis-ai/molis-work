import type { FormRecord, FormSubmissionRecord } from "@molis-ai/molis-work-contracts/modules/form";

/** What an exported fill page writes and `form.answers.import` reads back. */
export const FORM_ANSWER_FORMAT = "molis.form.answer.v1";

const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
/** JSON that can sit inside a <script> element without ending it. */
const scriptJson = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");

/**
 * One self-contained HTML file someone else opens in their own browser: they fill the form and the page saves an
 * answer file for them to send back. Nothing is uploaded anywhere; the owner imports the files into Results
 * (specs/archive/work-placement §6: forms are shared without a hosted collector).
 */
export function formFillPageHtml(form: FormRecord): string {
  const data = { format: FORM_ANSWER_FORMAT, form_id: form.id, form_version: form.version, title: form.title, description: form.description, questions: form.questions };
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(form.title)}</title>
<style>
:root{color-scheme:light dark;--ink:#222326;--muted:#6b6f76;--line:#d9dce1;--paper:#fff;--page:#f3f4f5;--accent:#5e6ad2}
@media (prefers-color-scheme:dark){:root{--ink:#f2f3f5;--muted:#9a9ea6;--line:#34363c;--paper:#18191b;--page:#0f1011;--accent:#8b93f1}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif}
main{max-width:640px;margin:32px auto;padding:0 16px}.sheet{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{font-size:22px;margin:0 0 6px}.lede,.hint{color:var(--muted);margin:0 0 18px}.q{margin:0 0 20px}.q>span{display:block;font-weight:600;margin-bottom:8px}
.opts{display:grid;gap:6px}.opts label{display:flex;gap:8px;align-items:center}input[type=text],input[type=date],select,textarea{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.rating{display:flex;gap:14px}.req{color:#c0392b}button{font:inherit;border:0;border-radius:8px;padding:10px 18px;background:var(--accent);color:#fff;cursor:pointer}
.error{color:#c0392b;min-height:1.4em}.done{display:none}.done.on{display:block}.foot{margin-top:16px;font-size:12px;color:var(--muted)}
</style></head>
<body><main><div class="sheet"><form id="f"><h1 id="t"></h1><p class="lede" id="d"></p><div id="qs"></div><p class="error" id="e" role="alert"></p><button type="submit" id="go">生成答卷文件</button>
<p class="hint" id="h">填完后会保存一个答卷文件（.json）。把它发回给发起人即可；这个页面不会上传任何内容。</p></form>
<div class="done" id="ok"><h1 id="okt">答卷文件已保存</h1><p class="lede" id="okd">请把刚下载的文件发回给发起人。需要改的话，可以重新填写再生成一份；发起人导入时同一份只算一次。</p><button type="button" id="again">重新填写</button></div></div>
<p class="foot" id="foot">Molis Work 问卷 · 在你的浏览器里填写，不需要账号</p></main>
<script id="form-data" type="application/json">${scriptJson(data)}</script>
<script>
(function(){
  var data = JSON.parse(document.getElementById("form-data").textContent);
  // Whoever fills it in may not read the author's language: a browser not set to Chinese gets English.
  var en = !/^zh/i.test(navigator.language || "") ? { title: "Form", untitled: "(Untitled question)", missing: "A required question is still empty: ", file: " · answers · ",
    go: "Save my answers", h: "When you finish, an answer file (.json) is saved. Send it back to whoever asked; this page uploads nothing.",
    okt: "Answer file saved", okd: "Send the file you just downloaded back to whoever asked. To change an answer, fill it in again and save another; each file counts once when it is imported.",
    again: "Fill in again", foot: "Molis Work form · filled in your browser, no account needed" } : null;
  var say = function(key, zh){ return en ? en[key] : zh; };
  if (en) { document.documentElement.lang = "en"; ["go", "h", "okt", "okd", "again", "foot"].forEach(function(id){ document.getElementById(id).textContent = en[id]; }); }
  var form = document.getElementById("f"), qs = document.getElementById("qs"), error = document.getElementById("e");
  document.getElementById("t").textContent = data.title || say("title", "问卷");
  document.getElementById("d").textContent = data.description || "";
  var el = function(tag, text){ var node = document.createElement(tag); if (text) node.textContent = text; return node; };
  data.questions.forEach(function(q){
    var box = el("div"); box.className = "q"; box.dataset.id = q.id; box.dataset.type = q.type; box.dataset.required = q.required ? "1" : "";
    var label = el("span", q.title || say("untitled", "（未命名题目）")); if (q.required) { var star = el("b", " *"); star.className = "req"; label.appendChild(star); } box.appendChild(label);
    if (q.type === "singleChoice" || q.type === "multiChoice") {
      var opts = el("div"); opts.className = "opts";
      (q.options || []).forEach(function(o){ var l = el("label"); var i = el("input"); i.type = q.type === "multiChoice" ? "checkbox" : "radio"; i.name = q.id; i.value = o.label; l.appendChild(i); l.appendChild(document.createTextNode(o.label)); opts.appendChild(l); });
      box.appendChild(opts);
    } else if (q.type === "dropdown") {
      var s = el("select"); s.name = q.id; s.appendChild(new Option("", "")); (q.options || []).forEach(function(o){ s.appendChild(new Option(o.label, o.label)); }); box.appendChild(s);
    } else if (q.type === "rating") {
      var r = el("div"); r.className = "opts rating"; for (var n = 1; n <= 5; n++) { var l2 = el("label"); var i2 = el("input"); i2.type = "radio"; i2.name = q.id; i2.value = String(n); l2.appendChild(i2); l2.appendChild(document.createTextNode(String(n))); r.appendChild(l2); } box.appendChild(r);
    } else {
      var t = el("input"); t.type = q.type === "date" ? "date" : "text"; t.name = q.id; box.appendChild(t);
    }
    qs.appendChild(box);
  });
  var answers = function(){
    var out = {};
    [].forEach.call(qs.querySelectorAll(".q"), function(box){
      var id = box.dataset.id, type = box.dataset.type;
      if (type === "multiChoice") out[id] = [].map.call(box.querySelectorAll("input:checked"), function(i){ return i.value; }).join(String.fromCharCode(10));
      else if (type === "singleChoice" || type === "rating") { var c = box.querySelector("input:checked"); out[id] = c ? c.value : ""; }
      else { var f = box.querySelector("input,select"); out[id] = f ? f.value.trim() : ""; }
    });
    return out;
  };
  var uuid = function(){ return (crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12); };
  form.addEventListener("submit", function(event){
    event.preventDefault();
    var value = answers();
    var missing = data.questions.filter(function(q){ return q.required && !value[q.id]; });
    if (missing.length) { error.textContent = say("missing", "还有必填题没填：") + missing[0].title; return; }
    error.textContent = "";
    var answer = { format: data.format, form_id: data.form_id, form_version: data.form_version, answer_id: uuid(), submitted_at: new Date().toISOString(), questions: data.questions, answers: value };
    var blob = new Blob([JSON.stringify(answer, null, 2)], { type: "application/json" });
    var link = document.createElement("a"); link.href = URL.createObjectURL(blob);
    link.download = (data.title || say("title", "问卷")).replace(/[\\\\/:*?"<>|]/g, "_") + say("file", " · 答卷 · ") + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".molis-answer.json";
    document.body.appendChild(link); link.click(); link.remove();
    form.style.display = "none"; document.getElementById("ok").className = "done on";
  });
  document.getElementById("again").addEventListener("click", function(){ form.reset(); form.style.display = ""; document.getElementById("ok").className = "done"; });
})();
</script></body></html>`;
}

export function formFillPageFilename(title: string): string {
  return (title.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").trim() || "问卷").slice(0, 80) + " · 填写页.html";
}

/** Responses as a table a spreadsheet opens: one row per response, one column per question (UTF-8 with BOM for Excel). */
export function formResultsCsv(form: FormRecord, submissions: readonly FormSubmissionRecord[]): string {
  const columns = new Map<string, string>();
  for (const question of form.questions) columns.set(question.id, question.title || question.id);
  for (const submission of submissions) for (const question of submission.questions) if (!columns.has(question.id)) columns.set(question.id, question.title || question.id);
  const cell = (value: string) => /[",\r\n]/u.test(value) || /^[=+\-@]/u.test(value) ? '"' + (/^[=+\-@]/u.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"' : value;
  const source = { preview: "试填", fill: "本机填写页", file: "答卷文件", agent: "助理提交", mcp: "外部工具提交", workflow: "工作流提交", plugin: "插件提交" } as const;
  const header = ["提交时间", "来源", ...columns.values()].map(cell).join(",");
  const rows = [...submissions].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).map(submission => [
    submission.submitted_at, source[submission.source], ...[...columns.keys()].map(id => String(submission.answers[id] ?? "").replaceAll("\n", "；")),
  ].map(cell).join(","));
  return "\ufeff" + [header, ...rows].join("\r\n") + "\r\n";
}

export function formResultsCsvFilename(title: string): string {
  return (title.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").trim() || "问卷").slice(0, 80) + " · 答卷.csv";
}
