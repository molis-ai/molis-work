import type { ReuseCandidates } from "./contracts.js";

/** The same partial is used in the research dialog and the interactive design fixture. */
export function renderReuseChoices(data: ReuseCandidates, escape: (value: unknown) => string, translate: (text: string) => string = text => text): string {
  const t = (value: string) => escape(translate(value));
  return `<section class="alc-reuse"><h3>${t("接着上次做")}</h3><p class="alc-muted">${t("选择这次能沿用的成果和方法。旧结论会作为背景，本次研究仍会核对新的证据。")}</p>
    ${!data.available ? `<p role="status">${t("成果入口尚未连接；可以先沿用研究方法。")}</p>` : ""}
    ${!data.artifacts.length ? `<p class="alc-muted">${t("还没有可读取的历史成果。完成研究后，可以保存一个固定版本。")}</p>` : data.artifacts.map((item, index) => `<label class="alc-reuse-choice"><input class="mw-checkbox" type="checkbox" name="reuse-artifact" value="${index}"><span><strong>${escape(item.title)}</strong><small>${t("固定版本")} ${item.reference.version} · ${escape(item.sourcePlugin)} · ${escape(item.createdAt.slice(0, 10))}</small><span>${escape(item.excerpt)}</span>${item.warnings.map(w => `<small class="alc-reuse-warning">${escape(w)}</small>`).join("")}</span></label>`).join("")}
    ${data.truncated ? `<p class="alc-muted">${t("只显示最近 40 份可读取成果；可以用固定版本引用继续查找。")}</p>` : ""}
    ${data.methods.length ? `<h3>${t("这次的研究方法")}</h3>${data.methods.map(item => `<label class="alc-reuse-choice"><input class="mw-checkbox" type="checkbox" name="reuse-method" value="${escape(item.id)}" checked><span><strong>${escape(item.methodChange)}</strong><small>${t("方法版本")} ${item.version}</small><span>${t("适用示例")}：${escape(item.positiveExamples.join("；") || translate("尚未填写，采用前请核对"))}</span><span>${t("不适用示例")}：${escape(item.negativeExamples.join("；") || translate("尚未填写，采用前请核对"))}</span></span></label>`).join("")}` : `<p class="alc-muted">${t("本次没有适用的已确认方法。你可以在研究报告中批注，再确认保存。")}</p>`}
    <label class="alc-field">${t("沿用成果的理由与仍需重核的内容")}<textarea class="mw-textarea" name="reuse-reason" rows="2" maxlength="2000" placeholder="${t("例如：沿用访谈问题；价格和竞品变化重新核对。")}"></textarea></label>
    <button type="button" class="mw-btn mw-btn--ghost" data-alc-action="reuse-assess">${t("检查所选内容的适用性")}</button><div data-reuse-assessment role="status" aria-live="polite"></div></section>`;
}

export const WORK_REUSE_STYLES = `
.alc-reuse { margin:24px 0 8px; border-top:1px solid var(--line); padding-top:4px; }
.alc-reuse h3 { font-size:14px; font-weight:500; margin:20px 0 8px; }
.alc-reuse-choice { display:flex; align-items:flex-start; gap:12px; padding:14px 0; border-bottom:1px solid var(--line); cursor:pointer; }
.alc-reuse-choice > input { flex:none; margin-top:3px; }
.alc-reuse-choice > span { display:flex; flex-direction:column; gap:6px; min-width:0; line-height:1.6; overflow-wrap:anywhere; }
.alc-reuse-choice strong { font-weight:500; }
.alc-reuse-choice small { color:var(--muted); font-size:12px; }
.alc-reuse-choice .alc-reuse-warning { color:var(--tone-blocked); }
[data-reuse-assessment] { margin-top:12px; line-height:1.7; }
`;
