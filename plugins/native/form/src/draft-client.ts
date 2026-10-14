/**
 * 「AI 生成题目」 in the Forms page (specs/ai-interaction-experience S1): sends the request; when the model first needs to know a
 * few things, shows the Host's shared question card under the prompt and binds it with the shared client the workbench gives
 * every plugin page (`host.interaction`), then sends the answer to go on. Field problems come back beside their fields; the
 * person's picks stay in the card meanwhile. Embedded into the page factory as text, so no imports at run time.
 */
export const FORM_DRAFT_CLIENT_SCRIPT = `({ host, request, L, ask, prompt, button, form, done, note }) => {
  let bound = null;
  const close = () => { if (bound) bound.destroy(); bound = null; ask.replaceChildren(); ask.hidden = true; };
  const send = async (extra) => {
    const record = form();
    if (!record) return;
    button.disabled = true;
    const card = ask.firstElementChild;
    if (card && extra.interaction) card.querySelectorAll("fieldset,button").forEach((node) => { node.disabled = true; });
    try {
      const payload = await request("POST", "/api/plugins/form/" + encodeURIComponent(record.id) + "/draft-questions", { prompt: prompt.value, expected_version: record.version, ...extra });
      if (payload.status === "needs_input") { show(payload.interaction); return; }
      close(); prompt.value = ""; await done(payload.form);
    } catch (failure) {
      const problems = failure.details && Array.isArray(failure.details.problems) ? failure.details.problems : null;
      if (bound && problems) bound.showErrors(Object.fromEntries(problems.map((problem) => ["q" + problem.question, problem.reason === "required" || problem.reason === "unanswered" ? L("这一题需要回答") : L("这一题的回答不能提交，请改一下")])));
      else note(failure.message, true);
    } finally {
      button.disabled = false;
      if (card && card.isConnected) card.querySelectorAll("fieldset,button").forEach((node) => { node.disabled = false; });
    }
  };
  const show = (interaction) => {
    close();
    const template = document.createElement("template"); template.innerHTML = interaction.html || "";
    const card = template.content.firstElementChild;
    if (!card || !host.interaction) { note(L("这里画不出补充问题，请把要求写得更具体后重试"), true); return; }
    ask.append(card); ask.hidden = false;
    bound = host.interaction(card, { onSubmit: () => send({ interaction: { interaction_id: interaction.interaction_id, values: bound.read() } }) });
  };
  return { start: () => send({}), close };
}`;
