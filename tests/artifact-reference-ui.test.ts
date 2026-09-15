import assert from "node:assert/strict";
import test from "node:test";
import { createArtifactReferenceRenderer, isProjectReference } from "@molis-ai/molis-work-app-workbench";
import { icon } from "@molis-ai/molis-work-design-system";
import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";

const render = createArtifactReferenceRenderer({
  escape: (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  icon,
  text: L,
});

test("Workbench mounts Artifact links with unchanged file endpoint and exact Evidence identity", () => {
  const html = render("project://notes/result.md#summary", "Results <2026>", "evidence&a");
  assert.match(html, /href="\/api\/project-references\/project%3A%2F%2Fnotes%2Fresult.md%23summary\?evidence_id=evidence%26a"/);
  assert.match(html, /target="_blank" rel="noreferrer" data-project-reference/);
  assert.match(html, /<span>Results &lt;2026&gt;<\/span>/);
  assert.doesNotMatch(html, /data-copy-value/);
});

test("Artifact reference embeds retain external links and copy-only opaque or unsafe local references", () => {
  assert.match(render("https://example.com/report?a=1&b=2"), /href="https:\/\/example.com\/report\?a=1&amp;b=2"/);
  for (const value of ["file:///private/result.txt", "javascript:alert(1)", "project://../secret.txt", "project:///etc/passwd", "opaque-result", ""]) {
    assert.equal(isProjectReference(value), false);
    const html = render(value);
    assert.match(html, /<button class="inline-ref" type="button" data-copy-value=/);
    assert.doesNotMatch(html, /<a\b/);
  }
});

test("Artifact reference translation remains request-local and untrusted labels stay escaped", () => {
  const english = runWithLocale("en", () => render('opaque" onclick="bad', '<img src=x onerror="bad">'));
  assert.match(english, /title="Copy reference"/);
  assert.match(english, /data-copy-value="opaque&quot; onclick=&quot;bad"/);
  assert.doesNotMatch(english, /<img| onclick="/);
  assert.match(runWithLocale("zh-CN", () => render("opaque")), /title="复制引用"/);
});
