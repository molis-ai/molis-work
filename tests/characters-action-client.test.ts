import assert from "node:assert/strict";
import test from "node:test";
import { characterActionClient } from "../apps/workbench/src/browser/characters/action-client.ts";

type ActionHost = Parameters<typeof characterActionClient>[0];

class ElementStub {
  checked = false;
  disabled = false;
  hidden = false;
  textContent = "";
  children: ElementStub[] = [];
  readonly dataset: Record<string, string> = {};

  constructor(readonly tag: string) {}

  append(...children: ElementStub[]): void { this.children.push(...children); }
  replaceChildren(): void { this.children = []; this.textContent = ""; }
  querySelectorAll(tag: string): ElementStub[] {
    return this.children.flatMap(child => child.tag === tag ? [child] : child.querySelectorAll(tag));
  }
}

function actionParts(missing?: string) {
  const inherit = new ElementStub("input");
  const field = new ElementStub("div");
  const list = new ElementStub("div");
  const status = new ElementStub("p");
  const refresh = new ElementStub("button");
  inherit.checked = true;
  field.hidden = true;
  field.append(list);
  const parts = new Map([
    ["actions-inherit", inherit], ["actions-field", field], ["actions-list", list],
    ["actions-status", status], ["actions-refresh", refresh],
  ]);
  if (missing) parts.delete(missing);
  const q: ActionHost["q"] = <T extends HTMLElement>(name: string): T | null => {
    const part = parts.get(name);
    return part ? part as T & ElementStub : null;
  };
  return { q, inherit, field, list, status, refresh };
}

test("BCRC-01 missing action controls are reported before reading the catalog", () => {
  for (const missing of ["actions-inherit", "actions-list"]) {
    const { q } = actionParts(missing);
    const requests: string[] = [];
    const request: ActionHost["request"] = async (_method, path) => {
      requests.push(path);
      throw new Error("unexpected catalog request");
    };
    assert.throws(() => characterActionClient({ q, request, changed() {} }), {
      message: "Characters page part missing: data-character-" + missing,
    });
    assert.deepEqual(requests, []);
  }
});

test("BCRC-02 current action controls keep the exact draft choice when the catalog changes or fails", async t => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: (tag: string) => new ElementStub(tag) },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });

  const { q, inherit, field, list, status, refresh } = actionParts();
  const chosen = { capability_id: "generated.82933d7e.notes.add", version: 1, provider_id: "plugin:x" };
  const entry = {
    capability_id: chosen.capability_id, version: 1,
    action: { title: "添加笔记", description: "在当前项目添加笔记", audiences: ["agent"] },
    provider: { provider_id: "plugin:x", title: "校验笔记插件" },
    availability: { available: true, reason: "" },
  };
  const alternatives = [{ ...entry, version: 2 }, { ...entry, provider: { provider_id: "plugin:y", title: "另一安装" } }];
  let actions = [...alternatives, entry];
  let readError: Error | undefined;
  const requests: string[][] = [];
  const request: ActionHost["request"] = async <T>(method: string, path: string): Promise<T> => {
    requests.push([method, path]);
    if (readError) throw readError;
    return { actions } as T;
  };
  const view = characterActionClient({ q, request, changed() {} });
  view.render(null);
  assert.equal(view.value(), null);
  assert.equal(field.hidden, true);
  assert.equal(view.describe(null), "沿用任务选择");
  view.render([]);
  assert.deepEqual(view.value(), []);
  assert.equal(field.hidden, false);
  assert.equal(view.describe([]), "不使用动作能力");

  view.render([chosen]);
  await view.refresh();
  assert.deepEqual(view.value(), [chosen]);
  assert.deepEqual(list.querySelectorAll("input").map(input => input.checked), [false, false, true]);
  assert.equal(view.describe([chosen]), "添加笔记 · v1 · 校验笔记插件");

  actions = alternatives;
  await view.refresh();
  const unavailable = list.querySelectorAll("input").at(-1);
  assert.ok(unavailable);
  assert.equal(unavailable.checked, true);
  assert.equal(unavailable.dataset.available, "false");
  assert.match(list.children.at(-1)?.children[1]?.textContent ?? "", /原能力、版本或授权不可用/);
  assert.equal(view.describe([chosen]), chosen.capability_id + " · v1 · plugin:x");

  view.controls(true);
  assert.equal(inherit.disabled, true);
  assert.equal(refresh.disabled, true);
  assert.equal(unavailable.disabled, true);
  view.controls(false);
  assert.equal(unavailable.disabled, false, "the person can remove the withdrawn selection");

  readError = new Error("目录暂时不可用");
  await view.refresh();
  assert.deepEqual(view.value(), [chosen], "a failed directory read keeps the exact saved choice");
  assert.equal(list.querySelectorAll("input").at(-1)?.checked, true);
  assert.equal(status.textContent, "目录暂时不可用；已有选择保持。");
  assert.equal(refresh.disabled, false);
  assert.deepEqual(requests, [["GET", "/actions"], ["GET", "/actions"], ["GET", "/actions"]]);
});
