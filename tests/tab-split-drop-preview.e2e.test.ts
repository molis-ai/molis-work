import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const overlayProbe = `(function() {
  const host = document.querySelector("[data-tab-panes]");
  if (!host || !host.hasAttribute("data-split-drop-preview")) return { w: 0, h: 0, left: 0, top: 0, hidden: true };
  const cs = getComputedStyle(host, "::after");
  return { w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0, left: parseFloat(cs.left) || 0, top: parseFloat(cs.top) || 0, hidden: false };
})`;

test("tab split drag preview matches the pane that will exist after drop", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");

  const probes = await evaluate<{
    inner: { preview: string; overlay: { w: number; h: number; hidden: boolean }; paneW: number; paneH: number; slot: boolean };
    leftMove: { preview: string; overlay: { w: number }; paneW: number; slot: boolean };
    left: { preview: string; overlay: { w: number }; paneW: number };
    corner: { preview: string };
    top: { preview: string; overlay: { h: number }; paneH: number };
  }>(`(() => {
    const tab = document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=home]');
    const body = document.querySelector('[data-tab-pane-body]');
    const pane = body.closest('[data-tab-pane]');
    const paneBox = pane.getBoundingClientRect();
    const over = (rx, ry, copy) => {
      const transfer = new DataTransfer();
      if (copy) {
        transfer.effectAllowed = 'copy';
        transfer.dropEffect = 'copy';
        document.body.dataset.tabDragCopy = '1';
      } else delete document.body.dataset.tabDragCopy;
      tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      const r = body.getBoundingClientRect();
      if (copy) transfer.dropEffect = 'copy';
      body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, altKey: !!copy, dataTransfer: transfer, clientX: r.left + r.width * rx, clientY: r.top + r.height * ry }));
      return { preview: pane.dataset.dropPreview, overlay: ${overlayProbe}(), paneW: paneBox.width, paneH: paneBox.height, slot: Boolean(document.querySelector('[data-tab-reorder-slot]')) };
    };
    return { inner: over(0.4, 0.5, false), leftMove: over(0.1, 0.5, false), left: over(0.1, 0.5, true), corner: over(0.1, 0.1, true), top: over(0.5, 0.1, true) };
  })()`);
  assert.equal(probes.inner.preview, "center");
  assert.equal(probes.inner.overlay.hidden, true, "center drop previews the tab slot, not a pane overlay");
  assert.equal(probes.inner.slot, true);
  assert.equal(probes.leftMove.preview, "left");
  assert.equal(probes.leftMove.slot, false);
  assert.ok(probes.leftMove.overlay.w > probes.leftMove.paneW * 0.7, "moving the last tab onto its own edge is a no-op: " + JSON.stringify(probes.leftMove));
  assert.equal(probes.left.preview, "left");
  assert.ok(Math.abs(probes.left.overlay.w / probes.left.paneW - 0.5) < 0.08, "copy-split left preview must be the half pane that a split creates: " + JSON.stringify(probes.left));
  assert.equal(probes.corner.preview, "left");
  assert.equal(probes.top.preview, "top");
  assert.ok(Math.abs(probes.top.overlay.h / probes.top.paneH - 0.5) < 0.08, "top preview must be the half pane that a split creates: " + JSON.stringify(probes.top));

  assert.equal(await evaluate("document.querySelectorAll('[data-tab-pane]').length"), 1);
  await evaluate(`(() => {
    const tab = document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=home]');
    const transfer = new DataTransfer();
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const body = document.querySelector('[data-tab-pane-body]');
    const r = body.getBoundingClientRect();
    body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + r.width * 0.4, clientY: r.top + r.height * 0.5 }));
    body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + r.width * 0.4, clientY: r.top + r.height * 0.5 }));
  })()`);
  assert.equal(await evaluate("document.querySelectorAll('[data-tab-pane]').length"), 1, "dropping in the content rest zone must not split");

  const before = await evaluate<{ previewWidth: number; originalWidth: number }>(`(() => {
    const tab = document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=home]');
    const transfer = new DataTransfer();
    transfer.effectAllowed = 'copy';
    document.body.dataset.tabDragCopy = '1';
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    transfer.dropEffect = 'copy';
    const body = document.querySelector('[data-tab-pane-body]');
    const pane = body.closest('[data-tab-pane]');
    const r = body.getBoundingClientRect();
    const at = { clientX: r.left + r.width * 0.1, clientY: r.top + r.height * 0.5 };
    body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer, ...at }));
    return { previewWidth: ${overlayProbe}().w, originalWidth: pane.getBoundingClientRect().width };
  })()`);
  await evaluate(`(() => {
    const tab = document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=home]');
    const transfer = new DataTransfer();
    transfer.effectAllowed = 'copy';
    document.body.dataset.tabDragCopy = '1';
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    transfer.dropEffect = 'copy';
    const body = document.querySelector('[data-tab-pane-body]');
    const r = body.getBoundingClientRect();
    const at = { clientX: r.left + r.width * 0.1, clientY: r.top + r.height * 0.5 };
    body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer, ...at }));
  })()`);
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const leftPaneWidth = await evaluate<number>(`[...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0].getBoundingClientRect().width`);
  assert.ok(Math.abs(before.previewWidth / before.originalWidth - 0.5) < 0.08, "preview should be half the source pane: " + JSON.stringify(before));
  assert.ok(Math.abs(leftPaneWidth / before.originalWidth - 0.5) < 0.08, "dropped left pane should be half the source pane: " + JSON.stringify({ leftPaneWidth, ...before }));
});

test("already split panes keep later drags and previews on the hovered pane", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  await evaluate("document.querySelector('[data-tab-edge=right]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");

  const probes = await evaluate<{
    rightLeft: { preview: string; overlay: { w: number; left: number }; paneW: number; paneLeft: number; marked: Array<string | null> };
    rightCenter: { preview: string; overlay: { w: number }; paneW: number };
    rightRight: { preview: string; overlay: { w: number }; paneW: number };
    rightTop: { preview: string; overlay: { h: number }; paneH: number };
    rightBottom: { preview: string; overlay: { h: number }; paneH: number };
    leftLeft: { preview: string; marked: Array<string | null> };
    workspaceW: number;
  }>(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const tab = panes[0].querySelector('[data-tab-id]');
    const probe = (index, rx, ry, copy) => {
      const pane = panes[index];
      const body = pane.querySelector('[data-tab-pane-body]');
      const r = body.getBoundingClientRect();
      const box = pane.getBoundingClientRect();
      const transfer = new DataTransfer();
      if (copy) {
        transfer.effectAllowed = 'copy';
        document.body.dataset.tabDragCopy = '1';
      } else delete document.body.dataset.tabDragCopy;
      tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      if (copy) transfer.dropEffect = 'copy';
      body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, altKey: !!copy, dataTransfer: transfer, clientX: r.left + r.width * rx, clientY: r.top + r.height * ry }));
      return {
        preview: pane.dataset.dropPreview,
        overlay: ${overlayProbe}(),
        paneW: box.width,
        paneH: box.height,
        paneLeft: box.left,
        marked: panes.map((item) => item.dataset.dropPreview || null),
        slot: Boolean(document.querySelector('[data-tab-reorder-slot]')),
      };
    };
    return {
      rightLeft: probe(1, 0.1, 0.5, true),
      rightCenter: probe(1, 0.4, 0.5, true),
      rightRight: probe(1, 0.9, 0.5, true),
      rightTop: probe(1, 0.5, 0.1, true),
      rightBottom: probe(1, 0.5, 0.9, true),
      leftLeft: probe(0, 0.1, 0.5, true),
      workspaceW: document.querySelector('[data-tab-panes]').getBoundingClientRect().width,
    };
  })()`);

  assert.equal(probes.rightLeft.preview, "left");
  assert.deepEqual(probes.rightLeft.marked, [null, "left"]);
  assert.ok(Math.abs(probes.rightLeft.overlay.w / probes.rightLeft.paneW - 0.5) < 0.08, "copy-split preview is half of the hovered pane: " + JSON.stringify(probes.rightLeft));
  assert.ok(Math.abs(probes.rightLeft.overlay.left - probes.rightLeft.paneLeft) < 12, "copy-split preview stays inside the hovered pane");
  assert.ok(probes.rightLeft.overlay.w < probes.workspaceW * 0.4, "already-split copy preview must not be half the whole stage");
  assert.equal(probes.rightCenter.preview, "center");
  assert.equal(probes.rightCenter.overlay.hidden, true, "copy into the neighbor rest zone previews a tab slot, not a pane overlay");
  assert.equal(probes.rightCenter.slot, true);
  assert.equal(probes.rightRight.preview, "right");
  assert.ok(Math.abs(probes.rightRight.overlay.w / probes.rightRight.paneW - 0.5) < 0.08);
  assert.equal(probes.rightTop.preview, "top");
  assert.ok(Math.abs(probes.rightTop.overlay.h / probes.rightTop.paneH - 0.5) < 0.08, "right-pane top preview is half of that pane: " + JSON.stringify(probes.rightTop));
  assert.equal(probes.rightBottom.preview, "bottom");
  assert.ok(Math.abs(probes.rightBottom.overlay.h / probes.rightBottom.paneH - 0.5) < 0.08);
  assert.equal(probes.leftLeft.preview, "left");
  assert.deepEqual(probes.leftLeft.marked, ["left", null]);

  const moveLast = await evaluate<{ overlayW: number; overlayLeft: number; workspaceW: number; workspaceLeft: number; paneCount: number }>(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const stage = document.querySelector('[data-tab-panes]').getBoundingClientRect();
    delete document.body.dataset.tabDragCopy;
    const tab = panes[0].querySelector('[data-tab-id]');
    const transfer = new DataTransfer();
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const body = panes[1].querySelector('[data-tab-pane-body]');
    const r = body.getBoundingClientRect();
    const at = { clientX: r.left + r.width * 0.1, clientY: r.top + r.height * 0.5 };
    body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, ...at }));
    const overlay = ${overlayProbe}();
    return { overlayW: overlay.w, overlayLeft: overlay.left, workspaceW: stage.width, workspaceLeft: stage.left, paneCount: panes.length };
  })()`);
  assert.ok(Math.abs(moveLast.overlayW / moveLast.workspaceW - 0.5) < 0.08, "moving the last tab must preview the layout after the empty pane closes: " + JSON.stringify(moveLast));
  assert.ok(Math.abs(moveLast.overlayLeft - moveLast.workspaceLeft) < 16, "that preview should land on the remaining left half, not the inner quarter");

  const moreMoves = await evaluate<{
    sameLeft: { w: number; left: number };
    moveBottom: { w: number; h: number; top: number };
    moveCenter: { w: number; h: number; hidden: boolean; slot: boolean };
    pane0: { width: number; left: number };
    pane1: { height: number };
    stage: { width: number; height: number; top: number };
  }>(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const stage = document.querySelector('[data-tab-panes]').getBoundingClientRect();
    delete document.body.dataset.tabDragCopy;
    const tab = panes[0].querySelector('[data-tab-id]');
    const over = (pane, rx, ry) => {
      const transfer = new DataTransfer();
      tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      const body = pane.querySelector('[data-tab-pane-body]');
      const r = body.getBoundingClientRect();
      body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + r.width * rx, clientY: r.top + r.height * ry }));
      return ${overlayProbe}();
    };
    return {
      sameLeft: over(panes[0], 0.1, 0.5),
      moveBottom: over(panes[1], 0.5, 0.9),
      moveCenter: { ...over(panes[1], 0.4, 0.5), slot: Boolean(document.querySelector('[data-tab-reorder-slot]')) },
      pane0: { width: panes[0].getBoundingClientRect().width, left: panes[0].getBoundingClientRect().left },
      pane1: { height: panes[1].getBoundingClientRect().height },
      stage: { width: stage.width, height: stage.height, top: stage.top },
    };
  })()`);
  assert.ok(Math.abs(moreMoves.sameLeft.w / moreMoves.pane0.width - 1) < 0.12, "moving the last tab onto its own edge is a no-op, so preview covers that pane: " + JSON.stringify(moreMoves));
  assert.ok(Math.abs(moreMoves.sameLeft.left - moreMoves.pane0.left) < 16);
  assert.ok(Math.abs(moreMoves.moveBottom.h / moreMoves.stage.height - 0.5) < 0.08, "moving the last tab under the neighbor previews the bottom half of the stage: " + JSON.stringify(moreMoves.moveBottom));
  assert.ok(Math.abs(moreMoves.moveBottom.w / moreMoves.stage.width - 1) < 0.08, "that bottom preview spans the full remaining width: " + JSON.stringify(moreMoves.moveBottom));
  assert.equal(moreMoves.moveCenter.hidden, true, "moving the last tab into the neighbor rest zone previews a tab slot, not a pane overlay");
  assert.equal(moreMoves.moveCenter.slot, true);

  await evaluate(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const tab = panes[0].querySelector('[data-tab-id]');
    const transfer = new DataTransfer();
    transfer.effectAllowed = 'copy';
    document.body.dataset.tabDragCopy = '1';
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    transfer.dropEffect = 'copy';
    const body = panes[1].querySelector('[data-tab-pane-body]');
    const r = body.getBoundingClientRect();
    const at = { clientX: r.left + r.width * 0.4, clientY: r.top + r.height * 0.5 };
    body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer, ...at }));
    body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer, ...at }));
  })()`);
  assert.equal(await evaluate("document.querySelectorAll('[data-tab-pane]').length"), 2, "dropping in the other pane's rest zone must not split");

  const nested = await evaluate<{ beforeH: number; previewH: number }>(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const right = panes[1];
    const beforeH = right.getBoundingClientRect().height;
    const tab = panes[0].querySelector('[data-tab-id]');
    const transfer = new DataTransfer();
    transfer.effectAllowed = 'copy';
    document.body.dataset.tabDragCopy = '1';
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    transfer.dropEffect = 'copy';
    const body = right.querySelector('[data-tab-pane-body]');
    const r = body.getBoundingClientRect();
    const at = { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.9 };
    body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer, ...at }));
    return { beforeH, previewH: ${overlayProbe}().h };
  })()`);
  await evaluate(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const tab = panes[0].querySelector('[data-tab-id]');
    const transfer = new DataTransfer();
    transfer.effectAllowed = 'copy';
    document.body.dataset.tabDragCopy = '1';
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    transfer.dropEffect = 'copy';
    const body = panes[1].querySelector('[data-tab-pane-body]');
    const r = body.getBoundingClientRect();
    const at = { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.9 };
    body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer, ...at }));
  })()`);
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 3");
  const stacked = await evaluate<{ count: number; bottomH: number }>(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].map((pane) => pane.getBoundingClientRect());
    const left = Math.min(...panes.map((box) => box.left));
    const rightCol = panes.filter((box) => box.left > left + 40).sort((a, b) => a.top - b.top);
    return { count: rightCol.length, bottomH: rightCol[1]?.height || 0 };
  })()`);
  assert.equal(stacked.count, 2, "bottom split of the right pane should stack two panes in the right column");
  assert.ok(Math.abs(nested.previewH / nested.beforeH - 0.5) < 0.08, "bottom preview is half the right pane: " + JSON.stringify(nested));
  assert.ok(Math.abs(stacked.bottomH / nested.beforeH - 0.5) < 0.08, "new bottom pane matches that half: " + JSON.stringify({ stacked, nested }));

  const continueThree = await evaluate<{ overlay: { w: number; left: number }; pane: { width: number; left: number } }>(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')];
    const items = panes.map((pane) => ({ pane, box: pane.getBoundingClientRect() }));
    const left = Math.min(...items.map((item) => item.box.left));
    const source = items.find((item) => Math.abs(item.box.left - left) < 8);
    const rightCol = items.filter((item) => item.box.left > left + 40).sort((a, b) => a.box.top - b.box.top);
    const bottom = rightCol[1];
    const tab = source.pane.querySelector('[data-tab-id]');
    const transfer = new DataTransfer();
    transfer.effectAllowed = 'copy';
    document.body.dataset.tabDragCopy = '1';
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    transfer.dropEffect = 'copy';
    const body = bottom.pane.querySelector('[data-tab-pane-body]');
    const r = body.getBoundingClientRect();
    body.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer, clientX: r.left + r.width * 0.1, clientY: r.top + r.height * 0.5 }));
    return { overlay: ${overlayProbe}(), pane: { width: bottom.box.width, left: bottom.box.left } };
  })()`);
  assert.ok(Math.abs(continueThree.overlay.w / continueThree.pane.width - 0.5) < 0.08, "copy-splitting a nested pane still previews half of that pane: " + JSON.stringify(continueThree));
  assert.ok(Math.abs(continueThree.overlay.left - continueThree.pane.left) < 16, "that nested preview stays inside the hovered pane");
});
