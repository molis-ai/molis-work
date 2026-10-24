/**
 * The chain editor's 「加在这里」 list (one gap between stations): the plugins that can stand there. A station that only starts a
 * run (成果, specs/artifact-positioning 五.1) is offered only for the first gap. Runs inside the workflow client and shares its scope.
 */
export const WORKFLOW_GAP_PICKER_SCRIPT = String.raw`
  function openGapPicker(gap) {
    const chain = ui.workflow;
    const before = chain.stations[gap - 1]; const after = chain.stations[gap];
    const heading = before && after ? L('workflows.gap.between-heading', { a: label(before), b: label(after) }) : before ? L('workflows.gap.after', { a: label(before) }) : after ? L('workflows.gap.before', { a: label(after) }) : L('workflows.gap.first');
    const others = ui.stations.filter((info) => !info.supported);
    // Past the first station, only stations that take handed-over content fit; the rest can only start a run.
    const fits = (info) => info.supported && (gap === 0 || info.receives !== false);
    const firstOnly = ui.stations.filter((info) => info.supported && !fits(info));
    ui.openLink = null; ui.openGap = gap;
    pop.dataset.mode = 'gap';
    pop.innerHTML = '<header class="wf-pop__head"><strong>' + esc(heading) + '</strong></header><div class="wf-pop__list" role="listbox" aria-label="' + esc(heading) + '">'
      + ui.stations.filter(fits).map((info) => '<button type="button" class="wf-pop__item" role="option" data-wf-action="insert" data-plugin="' + esc(info.plugin) + '" data-gap="' + gap + '" style="--station-tint:' + tint(info.plugin) + '">'
        + '<span class="wf-station__icon">' + ico(info.icon) + '</span><span>' + esc(L(info.label)) + '</span></button>').join('')
      + '</div>' + (firstOnly.length ? '<p class="wf-hint">' + esc(L('workflows.gap.first-only', { plugins: firstOnly.map((info) => L(info.label)).join('、') })) + '</p>' : '')
      + (others.length ? '<p class="wf-hint" title="' + esc(others.map((info) => L(info.label)).join('、')) + '">' + esc(L('workflows.palette.others', { count: others.length })) + '</p>' : '');
    markOpen();
    placePop(gapButtonOf(gap));
    pop.querySelector('.wf-pop__item')?.focus();
  }
`;
