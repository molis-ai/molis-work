import assert from "node:assert/strict";
import test from "node:test";
import { renderMolisWorkProjectIndex, renderMolisWorkProjectIndexStylesheet } from "./workbench-renderer-fixture.js";

const projects = [
  { project_id: "local-1", display_name: "工作台", data_class: "user" as const },
  { project_id: "demo-1", display_name: "Molis Work 示例项目", data_class: "regenerable_demo" as const },
  { project_id: "local-2", display_name: "另一份项目", data_class: "user" as const },
];

test("project index isolates arrival chrome from workbench directory styles", () => {
  const css = renderMolisWorkProjectIndexStylesheet();
  const html = renderMolisWorkProjectIndex(projects);

  assert.match(html, /class="brand"[^>]*>[\s\S]*<strong>Molis Work<\/strong>/);
  assert.match(html, /class="top-action"[^>]*>[\s\S]*系统设置/);
  assert.match(html, /data-project-search-row="[^"]*演示数据/);
  assert.match(html, /data-project-search-row="[^"]*本地项目/);
  assert.doesNotMatch(html, /已迁移/);
  assert.doesNotMatch(html, /Goals 与 Sessions/);
  assert.doesNotMatch(html, /project-index-migration|data-project-migration-dialog|data-open-project-migration|migration=1/);

  assert.match(css, /body\.project-index-page \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /body\.project-index-page > \.topbar,[\s\S]*grid-column: 1;/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(240px, 1fr\)\)/);
  assert.match(css, /body\.project-index-page > \.topbar > \.top-action \{[\s\S]*width: auto;/);
  assert.match(css, /\.project-index-actions \{ flex-direction: column/);
  assert.match(css, /\.project-card \{[\s\S]*max-width: 360px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const brandShow = css.lastIndexOf("body.project-index-page > .topbar > .brand {");
  const brandHide = css.lastIndexOf("body[data-desktop-shell=\"true\"]:not(.settings-page) .topbar > .brand");
  assert.ok(brandShow > brandHide && brandHide >= 0);
});
