/**
 * Saved records: Issue suggests a title and type for what is in the editor (`issues.suggest_name`, ISSUE-51) and fills
 * them in; nothing is written until the person saves, through the editor's versioned Save. A late answer, after the
 * person stopped, left, opened another record, changed the words or waited past two minutes, is dropped (ISSUE-49).
 */
export const ISSUE_REVIEW_CLIENT_SCRIPT = String.raw`
  let review = null;
  const stopReview = async () => { review = null; $('redo').disabled = false; };
  const reviewIssue = async () => {
    if (review || importing) return;
    const data = values();
    if (!data.description.trim() && !data.images.length) { flag(L('先写一句话或加一张截图。')); return; }
    const job = { target: current, data, at: Date.now() }, page = current.context?.page;
    review = job; $('redo').disabled = true; flag(L('正在重新整理…'));
    const active = () => review === job && current === job.target && editing && scope.alive;
    // Beside the model's own limit: still waiting after two minutes, the person gets the editor back as it is.
    const overdue = () => {
      if (!active()) return;
      if (Date.now() - job.at <= 120000) { scope.timeout(overdue, 1000); return; }
      void stopReview(); flag(L('没能重新整理，修改已保留，可以重试或直接保存。'));
    };
    overdue();
    let result;
    try { result = await api('suggest-name', { description: data.description, images: data.images, ...(page ? { page: { url: page.url, title: page.title } } : {}) }); }
    catch (error) {
      if (error.name === 'AbortError' || !active()) return;
      await stopReview();
      flag(['actions.connection_required', 'plugin.model_failed'].includes(error.code) ? L('模型暂时不可用，可以直接保存，或检查模型设置') : L('没能重新整理，修改已保留，可以重试或直接保存。'));
      return;
    }
    if (!active()) return;
    await stopReview();
    if (JSON.stringify(values()) !== JSON.stringify(data) || importing) { flag(L('内容已变化，请重新整理。')); return; }
    if (result.status === 'named') { fill({ ...data, title: result.title, type: result.type }); flag(L('已重新整理，确认后保存。')); }
    else flag(L('需要补充：') + L(result.question));
  };
`;
