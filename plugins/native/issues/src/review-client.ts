/** Saved records use the existing Assistant suggestion card, then the editor's versioned Save. No capture is created. */
export const ISSUE_REVIEW_CLIENT_SCRIPT = String.raw`
  let review = null, reviewEpoch = 0;
  const stopReview = async () => {
    const job = review; review = null; reviewEpoch++; $('redo').disabled = false;
    if (job) await quiet(job, true);
  };
  const reviewIssue = async () => {
    if (review || importing) return;
    const data = values();
    if (!data.description.trim() && !data.images.length) { flag(L('先写一句话或加一张截图。')); return; }
    const job = { id: crypto.randomUUID(), epoch: reviewEpoch, target: current, data, text: data.description, images: data.images, page: current.context?.page, at: Date.now() };
    review = job; $('redo').disabled = true; flag(L('正在重新整理…'));
    const active = () => review === job && current === job.target && editing && scope.alive;
    const finish = async note => { if (active()) { await stopReview(); if (reviewEpoch === job.epoch + 1 && !review && current === job.target && editing) flag(note); } };
    const watchReview = async () => {
      if (!active()) return;
      try {
        const view = await api('/api/assistant/works/' + encodeURIComponent(job.work));
        if (!active()) return;
        const card = view.cards.find(card => card.capability_id === 'issues.update' && card.status === 'ready'
          && card.fields.some(field => field.key === 'id' && field.value === job.target.id));
        const field = key => card?.fields.find(field => field.key === key);
        const title = field('title')?.value, type = field('type')?.raw || field('type')?.value;
        if (card && Number(field('expected_version')?.raw ?? field('expected_version')?.value) === job.target.version && title?.trim() && kinds[type]) {
          await stopReview();
          if (reviewEpoch !== job.epoch + 1 || review || current !== job.target || !editing) return;
          if (JSON.stringify(values()) !== JSON.stringify(data) || importing) { flag(L('内容已变化，请重新整理。')); return; }
          fill({ ...data, title, type }); flag(L('已重新整理，确认后保存。')); return;
        }
        const question = view.rounds.at(-1)?.awaiting_input?.find(entry => entry.answerable !== false);
        if (question) { await finish(L('需要补充：') + (question.questions?.[0]?.prompt || question.prompt)); return; }
        if (!card && ['idle', 'running'].includes(view.work.state) && Date.now() - job.at < 120000) { scope.timeout(watchReview, 900); return; }
        await finish(L('没能重新整理，修改已保留，可以重试或直接保存。'));
      } catch (error) { if (error.name !== 'AbortError') await finish(error.message); }
    };
    try {
      job.work = await sendWork(job, active);
      if (active()) await watchReview(); else await quiet(job, true);
    } catch (error) { if (error.name !== 'AbortError') await finish(error.message); }
  };
`;
