/**
 * 「AI 生成题目」 in the Forms page (specs/ai-interaction-experience S1): sends the request; when the model first needs to know a
 * few things, shows the Host's shared question card under the prompt and binds it with the shared client the workbench gives
 * every plugin page (`host.interaction`), then sends the answer to go on. The first question takes focus once the page is no
 * longer busy, which brings the card into view. Field problems come back beside their fields, worded by the Host; the person's
 * picks stay in the card, which is inert while a request is out. Embedded into the page factory as text, so no imports at run
 * time.
 */
export const FORM_DRAFT_CLIENT_SCRIPT = `({ host, request, L, ask, prompt, button, form, done, note }) => {
  let bound = null;
  const close = () => { if (bound) bound.destroy(); bound = null; ask.replaceChildren(); ask.hidden = true; };
  const send = async (extra) => {
    const record = form();
    if (!record) return;
    button.disabled = ask.inert = true;
    const sent = request("POST", "/api/plugins/form/" + encodeURIComponent(record.id) + "/draft-questions", { prompt: prompt.value, expected_version: record.version, ...extra })
      .finally(() => { button.disabled = ask.inert = false; });
    try {
      const payload = await sent;
      if (payload.status === "needs_input") show(payload.interaction);
      else { close(); await done(payload.form); }
    } catch (failure) {
      if (bound && failure.details?.errors) bound.showErrors(failure.details.errors, { focus: true });
      else note(failure.message, true);
    }
  };
  const show = (interaction) => {
    close();
    const template = document.createElement("template"); template.innerHTML = interaction.html || "";
    const card = template.content.firstElementChild;
    if (!card || !host.interaction) { note(L("这里画不出补充问题，请把要求写得更具体后重试"), true); return; }
    ask.append(card); ask.hidden = false;
    bound = host.interaction(card, { onSubmit: () => send({ interaction: { interaction_id: interaction.interaction_id, values: bound.read() } }) });
    requestAnimationFrame(() => bound?.focusField("q0"));
  };
  return { start: () => send({}), close };
}`;
