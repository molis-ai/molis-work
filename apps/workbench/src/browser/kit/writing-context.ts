import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { SkillCatalogEntry, SkillDraftSummary, SkillScope, SkillVersion } from "@molis-ai/molis-work-contracts/services/skills";
import type { AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SkillWritingLimits } from "./authoring.js";
import { readText, type Kit } from "./common.js";
import { listDrafts, type Fields } from "./drafts.js";
import type { View } from "./view.js";

// What the parts of the Skill drafts on the 「能力包」 page share (batch 42): the page they draw on, which Skills are the person's,
// and what is kept between draws. writing.ts builds it once; draft-editing.ts, draft-turns.ts and skill-actions.ts work on it.

export type WritingFocus = "au" | "au-error" | "au-failure" | "au-applies" | "au-scope" | "sk-title" | "sk-ask" | "sk-replay" | "sk-confirm" | "sk-case" | "sk-side" | "sk-tab";
export type SkillEntry = Extract<KitEntry, { kind: "skill" }>;
export type FieldName = Exclude<keyof Fields, "applies_to">;

/** The settings shell owns the loaded page's address and the lifetime of its cached editor. */
export interface KitSettingsPage {
  address(): URL;
  replace(next: URL, options?: { history: "replace" }): void;
  retain(lifetime: { beforeReplace(): Promise<boolean>; dispose(): void }): void;
}

export interface WritingPage {
  root: HTMLElement;
  project: string;
  address: Pick<KitSettingsPage, "address" | "replace">;
  active(): boolean;
  view: View;
  kit(): Kit | undefined;
  load(): Promise<void>;
  draw(focus?: "detail" | WritingFocus): void;
  say(text: string, tone?: "success" | "danger", next?: { label: string; attrs: Record<string, AttrValue> }): void;
  /** Opens this entry in its pack, with every filter cleared so it is in the list. */
  show(entry: KitEntry): void;
}

export interface WritingContext extends WritingPage {
  limits: SkillWritingLimits;
  /** Where a new Skill goes from this page: the project, or the personal space. */
  pageScope: SkillScope;
  isMine(skill: SkillCatalogEntry): boolean;
  skillOf(key?: string): SkillEntry | undefined;
  skills(): SkillEntry[];
  ownSkills(scope: SkillScope): SkillEntry[];
  /** Opens one of the person's own Skills in its pack. */
  showOwn(scope: SkillScope, skillId: string): SkillEntry | undefined;
  /** Reads the kit and the drafts again; what was read for a Skill's detail is read again too. */
  reload(): Promise<void>;
  /** Drafts not adopted yet; each own Skill's versions; a source's differences being shown. */
  drafts: SkillDraftSummary[];
  versions: Map<string, SkillVersion[] | "failed">;
  upstream: Map<string, string>;
}

export const written = (key: string, values?: Record<string, string | number>) => readText(`workbench.skill-authoring.${key}`, values);

export function writingContext(page: WritingPage): WritingContext {
  const { root, project } = page, ownPacks = new Set((root.dataset.skillMine ?? "").split(" "));
  const isMine = (skill: SkillCatalogEntry) => ownPacks.has(skill.pack.plugin_id) && skill.pack.trust === "home_local";
  const skills = () => (page.kit()?.catalog.entries ?? []).flatMap(entry => entry.kind === "skill" ? [entry] : []);
  const ownSkills = (scope: SkillScope) => skills().filter(entry => isMine(entry.skill) && entry.skill.pack.scope === scope);
  const context: WritingContext = {
    root, project, address: page.address, active: page.active, view: page.view, kit: () => page.kit(), load: () => page.load(), draw: focus => page.draw(focus), say: (text, tone, next) => page.say(text, tone, next), show: entry => page.show(entry),
    limits: JSON.parse(root.dataset.skillLimits ?? "{}") as SkillWritingLimits, pageScope: project ? "project" : "home",
    isMine, skills, ownSkills,
    skillOf: key => { const entry = key ? page.kit()?.byKey.get(key) : undefined; return entry?.kind === "skill" ? entry : undefined; },
    showOwn(scope, skillId) {
      const entry = ownSkills(scope).find(candidate => candidate.skill.ref.skill_id === skillId);
      if (entry) page.show(entry);
      return entry;
    },
    async reload() {
      context.versions.clear(); context.upstream.clear();
      const [, listed] = await Promise.all([page.load(), listDrafts(project).catch(() => context.drafts)]);
      context.drafts = listed;
    },
    drafts: [], versions: new Map(), upstream: new Map(),
  };
  return context;
}
