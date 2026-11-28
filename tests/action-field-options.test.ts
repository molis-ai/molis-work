import assert from "node:assert/strict";
import test from "node:test";
import {
  actionFieldInput, actionFieldLabel, actionFieldLabelKey, actionFieldLabelSource, actionFieldOptions, actionFieldValue, COMMON_ACTION_FIELD_KEYS,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { actionCardView, type ActionCard } from "@molis-ai/molis-work-plugin-sdk";
import { installTextForTest } from "@molis-ai/molis-work-plugin-sdk/ui";

test("a field's declared choices read by their labels: oneOf titles, or value=label pairs in the description", () => {
  const titled = { oneOf: [{ const: "personal", title: "个人空间" }, { const: "project", title: "当前项目" }] };
  assert.deepEqual(actionFieldOptions(titled), [{ value: "personal", label: "个人空间" }, { value: "project", label: "当前项目" }]);
  assert.equal(actionFieldValue("placement", "project", titled), "当前项目");
  // The style the Assistant's own rule actions use.
  const described = { enum: ["pages", "coding", "home"], description: "pages=Pages，coding=Coding，home=项目主页" };
  assert.equal(actionFieldValue("surface", "home", described), "项目主页");
  // An enum without labels keeps its values; a value outside the choices and a field without them read as they are.
  assert.deepEqual(actionFieldOptions({ enum: ["a", "b"] }), [{ value: "a", label: "a" }, { value: "b", label: "b" }]);
  assert.equal(actionFieldValue("placement", "elsewhere", titled), "elsewhere");
  assert.equal(actionFieldOptions({ type: "string" }), null);
  assert.equal(actionFieldValue("title", "周报", undefined), "周报");
  // A nullable field: choices wrapped with a null branch (as Todo declares its optional relation).
  const nullable = { anyOf: [{ oneOf: [{ const: "blocks", title: "要等它先完成" }, { const: "related", title: "相关" }] }, { type: "null" }] };
  assert.equal(actionFieldValue("relation", "related", nullable), "相关");
  assert.deepEqual(actionFieldOptions({ anyOf: [{ const: "a", title: "甲" }, { type: "null" }] }), [{ value: "a", label: "甲" }]);
});

test("a day or a moment is picked: the standard formats, through a nullable wrapper; a moment reads in local time", () => {
  const moment = { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] };
  assert.equal(actionFieldInput(moment), "datetime");
  assert.equal(actionFieldInput({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", format: "date" }), "date");
  assert.equal(actionFieldInput({ type: "string", minLength: 10 }), null);
  assert.equal(actionFieldInput({ oneOf: [{ const: "a" }, { const: "b" }] }), null);
  const at = new Date(2026, 9, 1, 9, 5);
  assert.equal(actionFieldValue("remind_at", at.toISOString(), moment), "2026-10-01 09:05");
  assert.equal(actionFieldValue("remind_at", "不是时间", moment), "不是时间");
});

test("action field labels, booleans and list joiners localize via readText while preserving defaultKey and fallback", () => {
  assert.equal(Object.keys(COMMON_ACTION_FIELD_KEYS).length, 34);
  assert.equal(new Set(Object.values(COMMON_ACTION_FIELD_KEYS)).size, 28);
  assert.equal(actionFieldLabelKey("goal_id"), undefined);
  assert.equal(actionFieldLabelKey("due_date"), "common.action-field.due-date");
  assert.equal(actionFieldLabelKey("expected_revision"), "common.action-field.expected-version");
  assert.equal(actionFieldLabelKey("expected_version"), "common.action-field.expected-version");
  assert.equal(actionFieldLabelKey("unknown_custom_field"), undefined);

  const enWords: Record<string, string> = {
    "common.action-field.title": "Title",
    "common.action-field.due-date": "Due date",
    "common.action-field.tags": "Tags",
    "common.action-field.content": "Content",
    "common.list.separator": ", ",
    "common.generated.yes": "Yes",
    "common.generated.no": "No",
  };
  const jaWords: Record<string, string> = {
    "common.action-field.title": "タイトル",
    "common.action-field.tags": "タグ",
    "common.list.separator": "、",
    "common.generated.yes": "はい",
    "common.generated.no": "いいえ",
  };
  const readEn = (key: string) => enWords[key];
  const readJa = (key: string) => jaWords[key];

  // Exact { label, defaultKey } shape preserved; declared.title takes priority over default labels.
  assert.deepEqual(actionFieldLabelSource("due_date", undefined, readEn), { label: "Due date", defaultKey: "due_date" });
  assert.deepEqual(actionFieldLabelSource("due_date", { title: "Custom title" }, readEn), { label: "Custom title" });
  assert.equal(actionFieldLabel("title", undefined, readJa), "タイトル");
  assert.equal(actionFieldLabel("status", undefined, readJa), "状态");
  assert.equal(actionFieldLabel("title"), "标题");

  assert.equal(actionFieldValue("starred", true, undefined, readEn), "Yes");
  assert.equal(actionFieldValue("starred", false, undefined, readEn), "No");
  assert.equal(actionFieldValue("starred", true, undefined, readJa), "はい");
  assert.equal(actionFieldValue("starred", false, undefined, readJa), "いいえ");
  assert.equal(actionFieldValue("tags", ["alpha", "beta"], undefined, readEn), "alpha, beta");
  assert.equal(actionFieldValue("tags", ["alpha", "beta"], undefined, readJa), "alpha、beta");
  assert.equal(actionFieldValue("tags", ["alpha", "beta"]), "alpha、beta");

  // actionCardView localizes via explicit reader AND via active UI text context, and never throws without one.
  const baseCard: ActionCard = {
    card_id: "c1",
    revision: 1,
    status: "ready",
    title: "Create item",
    summary: "Creates one item",
    reference: { capability_id: "todo.items.create", version: 1, provider_id: "io.molis.work.todo" },
    provider: "Todo",
    capability_title: "Create",
    effect: "write",
    input: { title: "Ship release", tags: ["a", "b"], starred: true },
    editable: [],
    missing: [],
    input_schema: { type: "object", properties: { title: { type: "string" }, tags: { type: "array" }, starred: { type: "boolean" } } },
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  };
  const explicit = actionCardView(baseCard, readEn);
  assert.deepEqual(explicit.fields.map(field => [field.key, field.label, field.value]), [
    ["title", "Title", "Ship release"],
    ["tags", "Tags", "a, b"],
    ["starred", "加星标", "Yes"],
  ]);
  const primitive = actionCardView({ ...baseCard, input: "Raw payload" }, readEn);
  assert.deepEqual(primitive.fields.map(field => [field.label, field.value]), [["Content", "Raw payload"]]);

  const restore = installTextForTest({
    locale: "en",
    packs: [{ format_version: 1, owner: "workbench", locale: "en", messages: enWords }],
  });
  try {
    const fromContext = actionCardView(baseCard);
    assert.deepEqual(fromContext.fields.map(field => [field.key, field.label, field.value]), [
      ["title", "Title", "Ship release"],
      ["tags", "Tags", "a, b"],
      ["starred", "加星标", "Yes"],
    ]);
  } finally {
    restore();
  }
  // Outside any UI text context, actionCardView falls back cleanly to Chinese defaults.
  assert.equal(actionCardView(baseCard).fields[0]?.label, "标题");
});
