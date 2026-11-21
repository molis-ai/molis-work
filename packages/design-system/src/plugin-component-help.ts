/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { t, type MwHelpSectionView, type MwHelpTopicData } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SandboxOperationContract, SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { Kit, State } from "./plugin-component-types.js";

interface FactSpec {
  readonly tone: "warn" | "out";
  readonly icon: string;
  readonly text: () => string;
}

/** Collects truthful pre-action facts strictly from the operation's declared SandboxEffects (VUX-56, VUX-59). */
function operationFactSpecs(op: SandboxOperationContract | undefined, kind: string): FactSpec[] {
  const facts: FactSpec[] = [];
  if (op) {
    const { effects } = op;
    if (effects.model?.includes("invoke") || effects.capabilities?.includes("model.generate")) {
      facts.push({ tone: "warn", icon: "sparkles", text: () => t.text("common.generated.fact-model") });
    }
    if (effects.imageGeneration?.includes("generate")) {
      facts.push({ tone: "warn", icon: "image", text: () => t.text("common.generated.fact-image") });
    }
    if (effects.networkDomains?.length) {
      const domains = effects.networkDomains.join(", ");
      facts.push({ tone: "out", icon: "globe", text: () => t.text("common.generated.fact-network", { domains }) });
    } else if (op.external || effects.connections?.length) {
      facts.push({ tone: "out", icon: "globe", text: () => t.text("common.generated.fact-external") });
    }
  }
  if (kind === "alert-dialog") {
    facts.push({ tone: "out", icon: "alert", text: () => t.text("common.generated.fact-irreversible") });
  }
  return facts;
}

/** Builds an always-visible `.mw-facts` block before submit actions when an operation has external, billed, or irreversible effects. */
export function buildPreActionFacts(c: State & Kit, op: SandboxOperationContract | undefined, kind: string): HTMLElement | null {
  const specs = operationFactSpecs(op, kind);
  if (!specs.length) return null;
  const section = c.make("section", undefined, "mw-facts pc-facts");
  section.dataset.slot = "facts";
  section.dataset.pcFacts = "";
  c.bindWord(section, "aria-label", () => t.text("common.generated.before-action"));
  section.append(c.words("h3", () => t.text("common.generated.before-action"), "mw-facts__heading"));
  for (const spec of specs) {
    const row = c.make("div", undefined, `mw-fact-row mw-fact-row--${spec.tone}`);
    const mark = c.make("span", undefined, "mw-fact-row__icon");
    mark.setAttribute("aria-hidden", "true");
    mark.append(c.glyph(spec.icon));
    row.append(mark, c.words("span", spec.text, "mw-fact-row__body"));
    section.append(row);
  }
  return section;
}

/** Derives truthful scope summary lines strictly from declared operations (never claims undeclared capabilities). */
function derivedScopeBody(contract: SandboxPluginContract): string {
  let hasModel = false;
  let hasImage = false;
  let hasExternal = false;
  const domains = new Set<string>();
  for (const op of contract.operations) {
    if (op.effects.model?.includes("invoke") || op.effects.capabilities?.includes("model.generate")) hasModel = true;
    if (op.effects.imageGeneration?.includes("generate")) hasImage = true;
    for (const domain of op.effects.networkDomains ?? []) domains.add(domain);
    if (op.external || op.effects.connections?.length) hasExternal = true;
  }
  const effects: string[] = [];
  if (hasModel) effects.push(t.text("common.generated.help-effect-model"));
  if (hasImage) effects.push(t.text("common.generated.help-effect-image"));
  if (domains.size) effects.push(t.text("common.generated.help-effect-network", { domains: [...domains].join(", ") }));
  else if (hasExternal) effects.push(t.text("common.generated.help-effect-external"));
  if (!effects.length) return t.text("common.generated.help-scope-local");
  return t.text("common.generated.help-scope-effects", { effects: effects.join(" · ") });
}

/**
 * Scheme A on-demand help wiring for generated plugins (VUX-55, VUX-59):
 * publishes `contract.help` (or a truthful fallback derived strictly from declared pages/effects) to
 * `<script data-mw-help-data>` and keeps one quiet 「帮助」 trigger in the active page header.
 */
export function pcHelp(c: State & Kit) {
  const { root, make, glyph, word, bindWord } = c;
  const helpScript = make("script") as HTMLScriptElement;
  helpScript.type = "application/json";
  helpScript.dataset.mwHelpData = "";
  helpScript.dataset.pcHelpData = "";
  root.append(helpScript);

  const helpBar = make("div", undefined, "pc-help-bar");
  helpBar.dataset.pcHelpBar = "";
  helpBar.hidden = true;
  root.append(helpBar);

  const trigger = make("button", undefined, "mw-btn mw-btn--ghost mw-btn--sm");
  trigger.type = "button";
  trigger.dataset.slot = "button";
  trigger.dataset.mwHelpTrigger = "true";
  trigger.dataset.pcHelpTrigger = "";
  trigger.dataset.helpTopic = "page";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "mw-help-region");
  const label = make("span");
  label.dataset.slot = "button-label";
  bindWord(label, "", () => t.text("common.help.title"));
  trigger.append(glyph("question"), label);

  function resolveTopics(contract: SandboxPluginContract): { topics: MwHelpTopicData[]; defaultTopic: string } {
    if (contract.help?.topics.length) {
      const defaultTopic = contract.help.default_topic || contract.help.topics[0]!.id;
      const topics: MwHelpTopicData[] = contract.help.topics.map((raw) => {
        const sections: MwHelpSectionView[] = raw.sections.map((section) => ({
          id: section.id,
          heading: word(section.heading),
          ...(section.body !== undefined ? { body: word(section.body) } : {}),
          ...(section.items?.length ? { items: section.items.map((item) => word(item)).filter(Boolean) } : {}),
          ...(section.collapsible ? { collapsible: true } : {}),
          ...(section.summary !== undefined ? { summary: word(section.summary) } : {}),
        }));
        return {
          id: raw.id,
          title: word(raw.title),
          ...(raw.first_visit_tip !== undefined ? { firstVisitTip: word(raw.first_visit_tip) } : {}),
          sections,
        };
      });
      return { topics, defaultTopic };
    }
    const pageTitles = contract.pages.map((page) => word(page.title)).filter(Boolean);
    const title = pageTitles[0] || contract.pluginId;
    const fallback: MwHelpTopicData = {
      id: "page",
      title,
      sections: [
        {
          id: "what",
          heading: t.text("common.help.section-what"),
          body: t.text("common.generated.help-what-fallback", { pages: pageTitles.join(" · ") || title }),
        },
        {
          id: "scope",
          heading: t.text("common.help.section-scope"),
          body: derivedScopeBody(contract),
        },
      ],
    };
    return { topics: [fallback], defaultTopic: "page" };
  }

  function placeHelp(pageId: string): void {
    const view = c.view;
    if (!view || !view.contract.pages.length) {
      helpBar.hidden = true;
      trigger.remove();
      return;
    }
    const headActions = [...c.parts.values()]
      .find((part) => part.node.pageId === pageId && part.node.kind === "frame")
      ?.root.querySelector<HTMLElement>(".pc-app-actions");
    if (headActions) {
      helpBar.hidden = true;
      if (trigger.parentElement !== headActions || headActions.lastElementChild !== trigger) headActions.append(trigger);
    } else {
      helpBar.hidden = false;
      if (trigger.parentElement !== helpBar) helpBar.append(trigger);
    }
  }

  function syncHelp(): void {
    const view = c.view;
    if (!view) return;
    const { topics, defaultTopic } = resolveTopics(view.contract);
    helpScript.textContent = JSON.stringify(topics);
    trigger.dataset.helpTopic = defaultTopic;
    placeHelp(c.currentPage || view.contract.pages[0]?.id || "");
  }

  return { syncHelp, placeHelp };
}
