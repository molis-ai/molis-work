// The catalog board's control specimens: buttons, fields, forms, feedback, overlays, menus and tabs.
import { escapeHtml, icon, renderAlert, renderAutocomplete, renderAvatar, renderBadge, renderButton, renderCalendar, renderCheckbox, renderCheckboxGroup, renderDatePicker, renderEmpty, renderField, renderFieldset, renderForm, renderInput, renderInputGroup, renderKbd, renderLabel, renderMeter, renderNumberField, renderOtpField, renderProgress, renderRadio, renderRadioGroup, renderSelect, renderSeparator, renderSeverityGrid, renderSkeleton, renderSlider, renderSpinner, renderStatusMark, renderSwitch, renderTextarea, renderToast, renderToggle } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderAccordion, renderBreadcrumb, renderCollapsible, renderCombobox, renderPagination, renderTabs, renderToggleGroup, renderToolbar } from "./navigation.js";
import { renderAlertDialog, renderCommand, renderContextMenu, renderDialog, renderDrawer, renderMenu, renderMenuGroup, renderMenuItem, renderHint, renderPopover, renderPreviewCard, renderSheet, renderTooltip } from "./overlay.js";
import { mark, resolveCatalogSay, section, specimen, type CatalogSay } from "./catalog-parts.js";

export function buttonSection(say: CatalogSay = resolveCatalogSay()): string {
  const primary = renderButton({ label: say("common.control.save"), variant: "primary" });
  const secondary = renderButton({ label: say("common.control.cancel"), variant: "secondary" });
  const ghost = renderButton({ label: say("workbench.context-toolbar.more"), variant: "ghost", icon: "more" });
  const danger = renderButton({ label: say("workbench.catalog-board.ds.ctrl-delete"), variant: "danger" });
  const dangerOutline = renderButton({ label: say("workbench.catalog-board.ds.ctrl-move-trash"), variant: "danger-outline" });
  const link = renderButton({ label: say("workbench.catalog-board.ds.ctrl-open-link"), variant: "link" });
  const iconBtn = renderButton({ label: say("common.control.close"), variant: "ghost", size: "icon", icon: "x", iconOnly: true });
  const loading = renderButton({ label: say("workbench.catalog-board.ds.ctrl-saving"), variant: "primary", loading: true });
  const loadingIcon = renderButton({ label: say("workbench.catalog-board.ds.ctrl-exporting"), variant: "secondary", icon: "download", loading: true });
  const disabled = renderButton({ label: say("workbench.capabilities.unavailable"), variant: "primary", disabled: true });
  const disabledSecondary = renderButton({ label: say("workbench.catalog-board.ds.ctrl-secondary-unavailable"), variant: "secondary", disabled: true });
  const sizes = ["sm", "md", "lg"].map((size) => renderButton({ label: size, variant: "secondary", size: size as "sm" | "md" | "lg" })).join("");
  return section("button", "Button", `<div class="mw-catalog__specimens">
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-primary-action")), `${primary}${secondary}${ghost}`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-destructive")), `${danger}${dangerOutline}`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-text-icon")), `${link}${iconBtn}`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-states")), `${loading}${loadingIcon}${disabled}${disabledSecondary}`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-sizes")), `<div class="mw-catalog__sizes">${sizes}</div>`)}
    </div>`);
}

export function fieldSection(say: CatalogSay = resolveCatalogSay()): string {
  const input = renderField({
    label: say("workbench.catalog-board.ds.ctrl-goal-name"),
    required: true,
    hint: say("workbench.catalog-board.ds.ctrl-goal-hint"),
    control: renderInput({ name: "catalog-title", placeholder: say("workbench.catalog-board.ds.ctrl-goal-placeholder"), required: true }),
  });
  const invalid = renderField({
    label: say("workbench.catalog-board.ds.ctrl-invalid-label"),
    error: say("workbench.catalog-board.ds.ctrl-invalid-error"),
    control: renderInput({ name: "catalog-invalid", invalid: true, value: "" }),
  });
  const disabledField = renderField({
    label: say("workbench.catalog-board.ds.ctrl-readonly-label"),
    hint: say("workbench.catalog-board.ds.ctrl-readonly-hint"),
    control: renderInput({ name: "catalog-disabled", value: say("workbench.catalog-board.ds.ctrl-sample-unify"), disabled: true }),
  });
  const textarea = renderField({
    label: say("workbench.catalog-board.ds.ctrl-outcome-label"),
    control: renderTextarea({ name: "catalog-outcome", placeholder: say("workbench.catalog-board.ds.ctrl-outcome-placeholder") }),
  });
  const select = renderField({
    label: say("workbench.catalog-board.ds.ctrl-parent-goal"),
    control: renderSelect({
      name: "catalog-parent",
      optionsHtml: `<option value="">${escapeHtml(say("workbench.catalog-board.ds.ctrl-standalone-goal"))}</option><option value="a">${escapeHtml(say("workbench.catalog-board.ds.ctrl-product-chain"))}</option>`,
    }),
  });
  const checks = `${renderCheckbox({ name: "catalog-dep", label: say("workbench.catalog-board.ds.ctrl-dep-required"), checked: true })}${renderCheckbox({ name: "catalog-dep-off", label: say("workbench.catalog-board.ds.ctrl-dep-disabled"), disabled: true })}${renderRadio({ name: "catalog-radio", value: "a", label: say("workbench.catalog-board.ds.ctrl-option-a"), checked: true })}${renderRadio({ name: "catalog-radio", value: "b", label: say("workbench.catalog-board.ds.ctrl-option-b") })}${renderSwitch({ name: "catalog-switch", label: say("workbench.catalog-board.ds.ctrl-enable-schedule"), checked: true })}`;
  const group = renderInputGroup({
    start: icon("search"),
    control: renderInput({ type: "search", placeholder: say("workbench.catalog-board.ds.ctrl-search-all") }),
  });
  const fieldset = renderFieldset({
    legend: say("workbench.catalog-board.ds.ctrl-fieldset-legend"),
    hint: say("workbench.catalog-board.ds.ctrl-fieldset-hint"),
    body: renderCheckbox({ name: "catalog-fs", label: say("workbench.catalog-board.ds.ctrl-ds-primitives") }),
  });
  const standaloneLabel = say("workbench.catalog-board.ds.ctrl-spec-label");
  return section("field", "Field / Input / Textarea / Select", `<div class="mw-catalog__specimens">
      ${mark("field", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-default")), input))}
      ${mark("input", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-error")), invalid))}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-disabled")), disabledField)}
      ${mark("textarea", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-multiline")), textarea))}
      ${mark("select", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-select")), select))}
      ${mark("label", specimen(escapeHtml(standaloneLabel), renderLabel({ text: standaloneLabel })))}
      ${mark("checkbox", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-choice-controls")), checks))}
      ${mark("input-group", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-input-group")), group))}
      ${mark("fieldset", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-fieldset")), fieldset))}
    </div>`);
}

export function groupsSection(say: CatalogSay = resolveCatalogSay()): string {
  return section("groups", "Checkbox Group / Radio Group / Switch", `<div class="mw-catalog__specimens">${mark("checkbox-group", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-checkbox-group")), renderCheckboxGroup({
      legend: say("workbench.catalog-board.ds.ctrl-completion-deps"),
      body: renderCheckbox({ name: "g1", label: say("workbench.catalog-board.ds.ctrl-design-system") }) + renderCheckbox({ name: "g2", label: say("workbench.catalog-board.ds.ctrl-browser-verify") }),
    })))}${mark("radio-group", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-radio-group")), renderRadioGroup({
      legend: say("workbench.catalog-board.ds.ctrl-view-legend"),
      name: "catalog-view",
      items: [{ value: "list", label: say("workbench.catalog-board.ds.ctrl-view-list"), checked: true }, { value: "board", label: say("workbench.catalog-board.ds.ctrl-view-board") }],
    })))}${mark("switch", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-switch")), renderSwitch({ name: "catalog-switch-2", label: say("workbench.catalog-board.ds.ctrl-show-archived"), checked: false })))}</div>`);
}

export function advancedFieldSection(say: CatalogSay = resolveCatalogSay()): string {
  return section("advanced-field", "Number / OTP / Slider / Meter / Autocomplete", `<div class="mw-catalog__specimens">
      ${mark("number-field", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-number")), renderNumberField({ name: "priority", value: 50, min: 0, max: 100 })))}
      ${mark("otp-field", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-otp")), renderOtpField({ name: "otp" })))}
      ${mark("slider", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-slider")), renderSlider({ name: "density", value: 28, min: 24, max: 44, label: say("workbench.catalog-board.ds.ctrl-density-label") })))}
      ${mark("meter", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-meter")), renderMeter({ value: 64, label: say("workbench.catalog-board.ds.ctrl-subitem-progress") })))}
      ${mark("autocomplete", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-autocomplete")), renderAutocomplete({
      placeholder: say("workbench.catalog-board.ds.ctrl-search-goal"),
      items: `<button type="button" role="option">${escapeHtml(say("workbench.catalog-board.ds.ctrl-sample-unify"))}</button><button type="button" role="option">${escapeHtml(say("workbench.catalog-board.ds.ctrl-product-chain"))}</button>`,
    })))}
    </div>`);
}

export function formSection(say: CatalogSay = resolveCatalogSay()): string {
  const primary = renderButton({ label: say("common.control.save"), variant: "primary" });
  const secondary = renderButton({ label: say("common.control.cancel"), variant: "secondary" });
  const input = renderField({
    label: say("workbench.catalog-board.ds.ctrl-goal-name"),
    required: true,
    hint: say("workbench.catalog-board.ds.ctrl-goal-hint"),
    control: renderInput({ name: "catalog-title", placeholder: say("workbench.catalog-board.ds.ctrl-goal-placeholder"), required: true }),
  });
  const form = renderForm({
    header: `<div><h2>${escapeHtml(say("workbench.catalog-board.ds.ctrl-form-title"))}</h2><p>${escapeHtml(say("workbench.catalog-board.ds.ctrl-form-subtitle"))}</p></div>`,
    body: input,
    footer: `${secondary}${primary}`,
    className: "mw-catalog-form",
  });
  return section("form", "Form", form);
}

export function badgeSection(say: CatalogSay = resolveCatalogSay()): string {
  const draft = say("workbench.catalog-board.ds.ctrl-status-draft");
  const done = say("workbench.catalog-board.ds.ctrl-status-done");
  const review = say("workbench.catalog-board.ds.ctrl-status-review");
  const badges = `<div class="mw-catalog__row">${([[draft, "neutral"], [say("workbench.assistant-delivery.progress"), "info"], [done, "success"], [review, "warning"], [say("workbench.assistant-delivery.failed"), "danger"]] as const)
    .map(([label, tone]) => renderBadge({ label, tone }))
    .join("")}</div><div class="mw-catalog__row">${([[draft, "draft", "idle"], [say("workbench.assistant-delivery.progress"), "doing", "progress"], [done, "done", "done"], [review, "verify", "attention"], [say("workbench.assistant-delivery.failed"), "failed", "blocked"]] as const)
    .map(([label, state, tone]) => renderStatusMark({ label, state, tone }))
    .join("")}</div>`;
  const alerts = renderAlert({ title: say("workbench.catalog-board.ds.ctrl-alert-fail-title"), body: say("workbench.catalog-board.ds.ctrl-alert-fail-body"), tone: "danger" })
    + renderAlert({ title: say("workbench.catalog-board.ds.ctrl-alert-ok-title"), body: say("workbench.catalog-board.ds.ctrl-alert-ok-body"), tone: "success" });
  const empty = renderEmpty({
    icon: "terminal",
    title: say("workbench.catalog-board.ds.ctrl-empty-session-title"),
    body: say("workbench.catalog-board.ds.ctrl-empty-session-body"),
    action: renderButton({ label: say("workbench.catalog-board.ds.ctrl-empty-session-action"), icon: "plus", variant: "primary" }),
  });
  const emptyStarts = renderEmpty({
    icon: "note",
    title: say("workbench.catalog-board.ds.ctrl-empty-doc-title"),
    body: say("workbench.catalog-board.ds.ctrl-empty-doc-body"),
    action: `<div class="mw-empty__actions">${renderButton({ label: say("workbench.catalog-board.ds.ctrl-empty-from-template"), icon: "library", variant: "secondary" })}${renderButton({ label: say("workbench.catalog-board.ds.ctrl-empty-import-doc"), icon: "upload", variant: "secondary" })}</div>`,
  });
  return section("badge", "Badge / Alert / Empty", `<div class="mw-catalog__specimens">
      ${mark("badge", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-status-badges")), badges))}
      ${mark("alert", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-alerts")), alerts))}
      ${mark("empty", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-empty-one")), empty))}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-empty-several")), emptyStarts)}
    </div>`);
}

/**
 * The 3 × 3 position mark (risk plugin, batch 17): every place in both sizes, the tone the caller picks, the axis titles,
 * and how it sits in a 390-wide overview row. Light, dark and forced colours come from the board's switches.
 */
export function severityGridSection(say: CatalogSay = resolveCatalogSay()): string {
  const levels = [say("workbench.catalog-board.ds.sev-level-low"), say("workbench.catalog-board.ds.sev-level-medium"), say("workbench.catalog-board.ds.sev-level-high")];
  const tone = (row: number, column: number) => row + column >= 5 ? "danger" as const : row + column === 4 ? "warning" as const : "neutral" as const;
  const every = (size: "small" | "large") => [3, 2, 1].flatMap((row) => [1, 2, 3].map((column) => renderSeverityGrid({
    row, column, tone: tone(row, column), size, label: say("workbench.catalog-board.ds.sev-cell-label", { impact: levels[row - 1]!, likelihood: levels[column - 1]! }),
  }))).join("");
  const axes = renderSeverityGrid({ row: 3, column: 2, tone: "danger", size: "large", label: say("workbench.catalog-board.ds.sev-axes-label-1"), rowLabel: say("workbench.catalog-board.ds.sev-axes-row-1"), columnLabel: say("workbench.catalog-board.ds.sev-axes-col-1") })
    + renderSeverityGrid({ row: 3, column: 2, tone: "danger", size: "large", label: say("workbench.catalog-board.ds.sev-axes-label-2"), rowLabel: say("workbench.catalog-board.ds.sev-axes-row-2"), columnLabel: say("workbench.catalog-board.ds.sev-axes-col-2") });
  const row = `<div style="inline-size: min(390px, 100%); display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px">${
    renderSeverityGrid({ row: 2, column: 3, tone: "danger", label: say("workbench.catalog-board.ds.sev-row-label") })}<span style="flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${escapeHtml(say("workbench.catalog-board.ds.sev-row-title"))}</span>${
    renderBadge({ label: say("workbench.catalog-board.ds.sev-row-status"), tone: "info" })}</div>`;
  return section("severity-grid", "Severity Grid", `<div class="mw-catalog__specimens">
      ${mark("severity-grid", specimen(escapeHtml(say("workbench.catalog-board.ds.sev-spec-small")), every("small")))}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.sev-spec-large")), every("large"))}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.sev-spec-axes")), axes)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.sev-spec-row")), row)}
    </div>`);
}

export function feedbackSection(say: CatalogSay = resolveCatalogSay()): string {
  return section("feedback", "Toast / Spinner / Skeleton / Progress / Kbd / Avatar", `<div class="mw-catalog__specimens">
      ${mark("toast", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-toast")), `<div class="mw-catalog__toasts">${renderToast({ message: say("workbench.catalog-board.ds.ctrl-toast-saved"), tone: "success" })}${renderToast({ message: say("workbench.catalog-board.ds.ctrl-toast-trashed"), action: { label: say("workbench.catalog-board.ds.ctrl-undo") } })}${renderToast({ message: say("workbench.catalog-board.ds.ctrl-toast-failed"), tone: "danger" })}</div>`))}
      ${mark("spinner", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-spinner")), renderSpinner({ label: say("workbench.catalog-board.ds.ctrl-loading") })))}
      ${mark("skeleton", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-skeleton")), renderSkeleton()))}
      ${mark("progress", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-progress")), renderProgress({ value: 40, label: say("workbench.catalog-board.ds.ctrl-subitem-progress") })))}
      ${mark("kbd", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-kbd")), renderKbd("⇧F10")))}
      ${mark("avatar", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-avatar")), renderAvatar({ label: say("workbench.catalog-board.ds.ctrl-avatar-name") })))}
    </div>`);
}

export function separatorSection(): string {
  return section("separator", "Separator", renderSeparator());
}

export function calendarSection(say: CatalogSay = resolveCatalogSay()): string {
  const title = say("workbench.catalog-board.ds.cal-title-sep-2026");
  const weekdays = [
    say("workbench.catalog-board.ds.cal-wd-mon"),
    say("workbench.catalog-board.ds.cal-wd-tue"),
    say("workbench.catalog-board.ds.cal-wd-wed"),
    say("workbench.catalog-board.ds.cal-wd-thu"),
    say("workbench.catalog-board.ds.cal-wd-fri"),
    say("workbench.catalog-board.ds.cal-wd-sat"),
    say("workbench.catalog-board.ds.cal-wd-sun"),
  ];
  const calendar = renderCalendar({ year: 2026, month: 8, today: "2026-09-17", selected: "2026-09-10", title, weekdays });
  const datePicker = renderDatePicker({
    name: "catalog-date",
    value: "2026-09-17",
    placeholder: say("workbench.catalog-board.ds.cal-placeholder"),
    calendar: { year: 2026, month: 8, today: "2026-09-17", selected: "2026-09-17", compact: true, title, weekdays },
  });
  return section("calendar", "Calendar / Date Picker", `<div class="mw-catalog__specimens">${specimen(escapeHtml(say("workbench.catalog-board.ds.cal-spec-month")), calendar)}${mark("date-picker", specimen(escapeHtml(say("workbench.catalog-board.ds.cal-spec-picker")), datePicker))}</div>`);
}

export function overlaySection(say: CatalogSay = resolveCatalogSay()): string {
  const primary = renderButton({ label: say("common.control.save"), variant: "primary" });
  const secondary = renderButton({ label: say("common.control.cancel"), variant: "secondary" });
  const danger = renderButton({ label: say("workbench.catalog-board.ds.ctrl-delete"), variant: "danger" });
  const closeLabel = say("common.control.close");
  const input = renderField({
    label: say("workbench.catalog-board.ds.ctrl-goal-name"),
    required: true,
    hint: say("workbench.catalog-board.ds.ctrl-goal-hint"),
    control: renderInput({ name: "catalog-title", placeholder: say("workbench.catalog-board.ds.ctrl-goal-placeholder"), required: true }),
  });
  const sheet = renderSheet({
    labelledBy: "catalog-sheet-title",
    title: say("workbench.catalog-board.ds.ctrl-sheet-title"),
    description: say("workbench.catalog-board.ds.ctrl-sheet-desc"),
    body: input,
    footer: `${secondary}${primary}`,
    closeLabel,
    attrs: { "data-catalog-demo": "sheet" },
  });
  const dialog = renderDialog({
    labelledBy: "catalog-dialog-title",
    title: say("workbench.catalog-board.ds.ctrl-dialog-title"),
    description: say("workbench.catalog-board.ds.ctrl-dialog-desc"),
    body: `<p>${escapeHtml(say("workbench.catalog-board.ds.ctrl-dialog-body"))}</p>`,
    footer: `${secondary}${primary}`,
    closeLabel,
    attrs: { "data-catalog-demo": "dialog" },
  });
  const alertDialog = renderAlertDialog({
    labelledBy: "catalog-alert-title",
    title: say("workbench.catalog-board.ds.ctrl-move-trash"),
    description: say("workbench.catalog-board.ds.ctrl-alert-desc"),
    body: `<p>${escapeHtml(say("workbench.catalog-board.ds.ctrl-alert-body"))}</p>`,
    footer: `${secondary}${danger}`,
    closeLabel,
    attrs: { "data-catalog-demo": "alert" },
  });
  const drawer = renderDrawer({
    labelledBy: "catalog-drawer-title",
    title: say("workbench.catalog-board.ds.ctrl-drawer-title"),
    description: say("workbench.catalog-board.ds.ctrl-drawer-desc"),
    body: `<p>Goals / Feed / Session</p>`,
    footer: secondary,
    closeLabel,
    attrs: { "data-catalog-demo": "drawer" },
  });
  return section("overlay", "Dialog / Sheet / Alert Dialog / Drawer", `
      <div class="mw-catalog__specimens">${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-open-overlays")), `
        ${renderButton({ label: say("workbench.catalog-board.ds.ctrl-open-sheet"), variant: "secondary", attrs: { "data-catalog-open": "sheet" } })}
        ${renderButton({ label: say("workbench.catalog-board.ds.ctrl-open-dialog"), variant: "secondary", attrs: { "data-catalog-open": "dialog" } })}
        ${renderButton({ label: say("workbench.catalog-board.ds.ctrl-open-alert"), variant: "danger-outline", attrs: { "data-catalog-open": "alert" } })}
        ${renderButton({ label: say("workbench.catalog-board.ds.ctrl-open-drawer"), variant: "secondary", attrs: { "data-catalog-open": "drawer" } })}
      `)}</div>
      ${mark("sheet", sheet)}${mark("dialog", dialog)}${mark("alert-dialog", alertDialog)}${mark("drawer", drawer)}`);
}

export function menuSection(say: CatalogSay = resolveCatalogSay()): string {
  return section("menu", "Menu / Context Menu / Popover / Tooltip / Command / Preview Card", `<div class="mw-catalog__specimens">${mark("menu", specimen(say("workbench.catalog-controls.menu"), renderMenu({
      items: renderMenuGroup({ items: renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-menu-rename"), iconName: "edit", shortcut: "F2" }) + renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-menu-copy-link"), iconName: "link", shortcut: "⌘C" }) + renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-menu-move-project"), iconName: "folder", disabled: true }) })
        + renderMenuGroup({ items: renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-delete"), iconName: "trash", danger: true, shortcut: "⌘⌫" }) }),
    })))}${mark("context-menu", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-context-menu")), renderContextMenu({
      items: renderMenuGroup({ label: say("workbench.catalog-board.ds.ctrl-menu-display"), items: renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-menu-line-numbers"), checked: true }) + renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-menu-word-wrap"), checked: false }) })
        + renderMenuGroup({ items: renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-menu-pin-tab"), iconName: "pin" }) + renderMenuItem({ label: say("workbench.catalog-board.ds.ctrl-menu-close-tab"), iconName: "x", danger: true, shortcut: "⌘W" }) }),
    })))}${mark("popover", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-popover")), renderPopover({ body: `<div class="mw-catalog__row">${renderInput({ name: "catalog-link", placeholder: say("workbench.catalog-board.ds.ctrl-popover-placeholder"), size: "sm" })}${renderButton({ label: say("workbench.catalog-board.ds.ctrl-apply"), variant: "primary" })}</div>`, preview: true })))}${mark("tooltip", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-hint")), renderHint({ id: "catalog-hint", label: say("workbench.catalog-board.ds.ctrl-hint-label"), text: say("workbench.catalog-board.ds.ctrl-hint-text") })) + specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-tooltip")), renderTooltip({ text: say("workbench.catalog-board.ds.ctrl-tooltip-goal") })))}${mark("command", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-command")), renderCommand({
      labelledBy: "catalog-command",
      placeholder: say("workbench.catalog-board.ds.ctrl-command-placeholder"),
      groups: `<button type="button" role="option">${escapeHtml(say("workbench.catalog-board.ds.ctrl-command-item"))}</button>`,
    })))}${mark("preview-card", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-preview")), renderPreviewCard({ title: say("workbench.catalog-board.ds.ctrl-sample-unify"), body: say("workbench.catalog-board.ds.ctrl-preview-body") })))}</div>`);
}

export function tabsSection(say: CatalogSay = resolveCatalogSay()): string {
  const primary = renderButton({ label: say("common.control.save"), variant: "primary" });
  const ghost = renderButton({ label: say("workbench.context-toolbar.more"), variant: "ghost", icon: "more" });
  return section("tabs", "Tabs / Toolbar / Toggle / Collapsible / Combobox / Accordion / Pagination / Breadcrumb", `<div class="mw-catalog__specimens">${mark("tabs", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-tabs")), renderTabs({
      label: say("workbench.catalog-board.ds.ctrl-tabs-aria"),
      tabs: [{ id: "overview", label: say("workbench.catalog-board.ds.ctrl-tab-overview"), selected: true }, { id: "agenda", label: say("workbench.catalog-board.ds.ctrl-tab-schedule") }],
    })))}${mark("toolbar", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-toolbar")), renderToolbar({ body: primary + ghost })))}${mark("toggle", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-toggle")), renderToggle({ label: say("workbench.catalog-board.ds.ctrl-toggle-pin"), pressed: true })))}${mark("toggle-group", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-toggle-group")), renderToggleGroup({
      label: say("workbench.catalog-board.ds.ctrl-view-legend"),
      items: [{ value: "list", label: say("workbench.catalog-board.ds.ctrl-view-list"), current: true }, { value: "board", label: say("workbench.catalog-board.ds.ctrl-view-board") }, { value: "canvas", label: say("workbench.catalog-board.ds.ctrl-view-canvas") }],
    })))}${mark("collapsible", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-collapsible")), renderCollapsible({ summary: say("workbench.catalog-board.ds.ctrl-collapsible-summary"), body: `<p>${escapeHtml(say("workbench.catalog-board.ds.ctrl-collapsible-body"))}</p>` })))}${specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-disclosure")), `<details class="mw-disclosure"><summary>${escapeHtml(say("workbench.catalog-board.ds.ctrl-disclosure-summary"))}</summary></details>`)}${mark("combobox", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-combobox")), renderCombobox({
      placeholder: say("workbench.catalog-board.ds.ctrl-select-goal"),
      items: `<button type="button" role="option">${escapeHtml(say("workbench.catalog-board.ds.ctrl-product-chain"))}</button>`,
    })))}${mark("accordion", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-accordion")), renderAccordion({
      items: [
        { summary: say("workbench.catalog-board.ds.ctrl-acc-project"), body: `<p>${escapeHtml(say("workbench.catalog-board.ds.ctrl-acc-project-body"))}</p>`, open: true },
        { summary: say("workbench.catalog-board.ds.ctrl-acc-rules"), body: `<p>${escapeHtml(say("workbench.catalog-board.ds.ctrl-acc-rules-body"))}</p>` },
      ],
    })))}${mark("pagination", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-pagination")), renderPagination({ page: 2, pages: 5 })))}${mark("breadcrumb", specimen(escapeHtml(say("workbench.catalog-board.ds.ctrl-spec-breadcrumb")), renderBreadcrumb({
      items: [{ label: say("workbench.catalog-board.ds.ctrl-bc-planning"), href: "#" }, { label: say("workbench.catalog-board.ds.ctrl-bc-work-type") }, { label: say("workbench.catalog-board.ds.ctrl-bc-current") }],
    })))}</div>`);
}
