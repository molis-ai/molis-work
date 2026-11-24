// The catalog board's choice group and composition specimens: the same primitives put together as product pages do.
import { escapeHtml, icon, renderAlert, renderButton, renderChoice, renderDirectoryPanel, renderDirectoryRow, renderField, renderForm, renderFrame, renderInput, renderInputGroup, renderScrollArea, renderSelect, renderTextarea } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderToggleGroup, renderToolbar } from "./navigation.js";
import { renderDialog, renderMenu, renderMenuItem } from "./overlay.js";
import { mark, resolveCatalogSay, section, specimen, type CatalogSay } from "./catalog-parts.js";

export function choiceSection(say: CatalogSay = resolveCatalogSay()): string {
  return section("choice", "Choice", `<div class="mw-catalog__specimens">
    ${mark("choice", specimen(escapeHtml(say("workbench.catalog-board.ds.choice-btn-caption")), `<div class="mw-choice-group" role="group" aria-label="${escapeHtml(say("workbench.catalog-board.ds.choice-theme-aria"))}" data-catalog-choice-group>${renderChoice({ label: say("workbench.context-onboarding.light"), icon: "sun", selected: true })}${renderChoice({ label: say("workbench.context-onboarding.dark"), icon: "moon" })}${renderChoice({ label: say("workbench.catalog-board.ds.choice-follow-system"), icon: "system" })}</div>`))}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.choice-link-caption")), `<div class="mw-choice-group" role="group" aria-label="${escapeHtml(say("workbench.catalog-board.ds.choice-lang-aria"))}">${renderChoice({ label: say("workbench.catalog-board.ds.choice-lang-zh"), href: "#choice", selected: true })}${renderChoice({ label: "English", href: "#choice" })}</div>`)}
  </div>`);
}

export function composeSection(say: CatalogSay = resolveCatalogSay()): string {
  const firstTitle = say("workbench.catalog-board.ds.compose-item-1-title");
  const firstCaption = say("workbench.catalog-board.ds.compose-item-1-caption");
  const goalsLabel = say("workbench.catalog-board.ds.compose-goals-label");
  const composeRows = [
    [firstTitle, firstCaption, "progress"],
    [say("workbench.catalog-board.ds.compose-item-2-title"), say("workbench.catalog-board.ds.compose-item-2-caption"), "attention"],
    [say("workbench.catalog-board.ds.compose-item-3-title"), say("workbench.catalog-board.ds.compose-item-3-caption"), "idle"],
  ].map(([title, caption, tone], index) => renderDirectoryRow({
    title, caption, icon: "target", density: "meta", current: index === 0, statusTone: tone as "progress" | "attention" | "idle",
    attrs: { "data-compose-item": title, "data-compose-caption": caption },
  })).join("");
  const composeSplit = `<div class="mw-compose mw-compose--split" data-compose-split>
    <div class="mw-compose__list">${renderDirectoryPanel({ pluginId: "compose-list", label: goalsLabel, listLabel: goalsLabel, listRole: "none", body: composeRows, add: { label: say("workbench.catalog-board.ds.compose-new-goal") } })}</div>
    <div class="mw-compose__detail">${renderFrame({
      title: firstTitle,
      description: firstCaption,
      action: renderButton({ label: say("workbench.catalog-board.ds.compose-record-progress"), variant: "primary", size: "sm", icon: "plus" }),
      panel: `<p data-compose-body>${escapeHtml(say("workbench.catalog-board.ds.compose-detail-body"))}</p>`,
    })}</div>
  </div>`;
  const composeFilterMenu = renderMenu({
    items: renderMenuItem({ label: say("workbench.catalog-board.ds.compose-filter-active"), iconName: "check" })
      + renderMenuItem({ label: say("workbench.catalog-board.ds.compose-filter-archived"), iconName: "archive" })
      + renderMenuItem({ label: say("workbench.catalog-board.ds.compose-filter-clear"), iconName: "x" }),
    labelledBy: "compose-filter-button",
    className: "mw-anchored-menu",
    attrs: { id: "compose-filter-menu", popover: "auto" },
  });
  const filterLabel = say("workbench.catalog-board.ds.compose-filter-action");
  const newLabel = say("workbench.catalog-board.ds.compose-new-action");
  const composeToolbar = `<div class="mw-compose mw-compose--toolbar">${renderToolbar({ body: `
    <div class="mw-compose__search">${renderInputGroup({ start: icon("search"), control: renderInput({ type: "search", placeholder: say("workbench.catalog-board.ds.compose-search-placeholder") }) })}</div>
    ${renderToggleGroup({ label: say("workbench.catalog-board.ds.compose-view-label"), items: [{ value: "list", label: say("workbench.catalog-board.ds.compose-view-list"), current: true }, { value: "board", label: say("workbench.catalog-board.ds.compose-view-board") }, { value: "canvas", label: say("workbench.catalog-board.ds.compose-view-canvas") }] })}
    ${renderButton({ label: filterLabel, variant: "secondary", icon: "filter", attrs: { id: "compose-filter-button", "data-anchored-menu": true, popovertarget: "compose-filter-menu", "aria-controls": "compose-filter-menu", "aria-expanded": "false", "aria-haspopup": "menu" } })}${composeFilterMenu}
    <span class="mw-compose__spacer"></span>
    ${renderButton({ label: newLabel, variant: "primary", icon: "plus" })}` })}</div>`;
  const composeForm = renderForm({
    header: `<div><h2>${escapeHtml(say("workbench.catalog-board.ds.compose-form-title"))}</h2><p>${escapeHtml(say("workbench.catalog-board.ds.compose-form-subtitle"))}</p></div>`,
    body: renderAlert({ title: say("workbench.catalog-board.ds.compose-form-alert-title"), body: say("workbench.catalog-board.ds.compose-form-alert-body"), tone: "danger" })
      + renderField({ label: say("workbench.catalog-board.ds.compose-form-url-label"), error: say("workbench.catalog-board.ds.compose-form-url-error"), control: renderInput({ name: "compose-url", value: "example", invalid: true }) })
      + renderField({ label: say("workbench.catalog-board.ds.compose-form-name-label"), hint: say("workbench.catalog-board.ds.compose-form-name-hint"), control: renderInput({ name: "compose-name", value: say("workbench.catalog-board.ds.compose-form-name-value") }) })
      + renderField({ label: say("workbench.catalog-board.ds.compose-form-note-label"), control: renderTextarea({ name: "compose-note", placeholder: say("workbench.catalog-board.ds.compose-form-note-placeholder") }) }),
    footer: `${renderButton({ label: say("common.control.cancel"), variant: "secondary" })}${renderButton({ label: say("common.control.save"), variant: "primary" })}`,
    className: "mw-catalog-form",
  });
  const composeDialog = renderDialog({
    labelledBy: "compose-dialog-title",
    title: say("workbench.catalog-board.ds.compose-move-title"),
    description: say("workbench.catalog-board.ds.compose-move-desc"),
    body: renderField({ label: say("workbench.catalog-board.ds.compose-move-project-label"), control: renderSelect({ name: "compose-project", optionsHtml: `<option>${escapeHtml(say("workbench.catalog-board.ds.compose-project-demo"))}</option><option>${escapeHtml(say("workbench.catalog-board.ds.compose-project-growth"))}</option><option>Research</option>` }) })
      + `<div class="mw-compose__anchor mw-compose__anchor--inline">${renderButton({ label: say("workbench.catalog-board.ds.compose-more-actions"), variant: "secondary", icon: "more", attrs: { "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" } })}<div class="mw-compose__menu" data-compose-menu hidden>${renderMenu({ items: renderMenuItem({ label: say("workbench.catalog-board.ds.compose-copy-link"), iconName: "link" }) + renderMenuItem({ label: say("workbench.catalog-board.ds.compose-move-trash"), iconName: "trash", danger: true }) })}</div></div>`,
    footer: `${renderButton({ label: say("common.control.cancel"), variant: "secondary", attrs: { "data-dialog-close": "" } })}${renderButton({ label: say("workbench.catalog-board.ds.compose-move-confirm"), variant: "primary" })}`,
    closeLabel: say("common.control.close"),
    attrs: { "data-catalog-demo": "compose-dialog" },
  });
  const composeLong = `<div class="mw-compose mw-compose--long">${renderScrollArea({
    className: "mw-compose__scroll",
    body: `<h3>${escapeHtml(say("workbench.catalog-board.ds.compose-long-heading"))}</h3><p>${escapeHtml(say("workbench.catalog-board.ds.compose-long-intro"))}</p>
      <pre class="mw-compose__code"><code>pnpm --filter ./packages/design-system --filter ./apps/workbench run build && node dist/web/server.js --port 4251 --home ~/.molis-work</code></pre>
      ${renderScrollArea({ className: "mw-compose__nested", body: Array.from({ length: 12 }, (_, index) => `<p>${escapeHtml(say("workbench.catalog-board.ds.compose-long-attachment", { index: index + 1 }))}</p>`).join("") })}
      ${Array.from({ length: 6 }, (_, index) => `<p>${escapeHtml(say("workbench.catalog-board.ds.compose-long-paragraph", { index: index + 1 }))}</p>`).join("")}`,
  })}</div>`;
  const composeNarrow = `<div class="mw-compose mw-compose--narrow" data-compose-narrow>
    <div class="mw-compose__density"><span>${escapeHtml(say("workbench.catalog-board.ds.compose-density-label"))}</span><div class="mw-choice-group" role="group" aria-label="${escapeHtml(say("workbench.context-onboarding.interface-density"))}">${renderChoice({ label: say("workbench.context-onboarding.standard"), icon: "rows", selected: true, attrs: { "data-density-option": "standard" } })}${renderChoice({ label: say("workbench.context-onboarding.compact"), icon: "list", attrs: { "data-density-option": "compact" } })}</div></div>
    <div class="mw-compose__resizable">${renderToolbar({ body: `${renderButton({ label: newLabel, variant: "primary", icon: "plus" })}${renderButton({ label: filterLabel, variant: "secondary", icon: "filter" })}${renderButton({ label: say("workbench.catalog-board.ds.compose-workflow-action"), variant: "ghost", icon: "workflow" })}` })}${renderDirectoryPanel({ pluginId: "compose-narrow", label: goalsLabel, listLabel: goalsLabel, listRole: "none", body: composeRows })}</div>
    <p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-board.ds.compose-narrow-hint"))}</p>
  </div>`;
  return section("compose", escapeHtml(say("workbench.catalog-board.ds.compose-title")), `<div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.compose-spec-split")), composeSplit)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.compose-spec-toolbar")), composeToolbar)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.compose-spec-form")), composeForm)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.compose-spec-dialog")), renderButton({ label: say("workbench.catalog-board.ds.compose-open-dialog"), variant: "secondary", attrs: { "data-catalog-open": "compose-dialog" } }) + composeDialog)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.compose-spec-long")), composeLong)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.compose-spec-narrow")), composeNarrow)}
  </div>`);
}
