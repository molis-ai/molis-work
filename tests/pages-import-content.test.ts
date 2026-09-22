import assert from "node:assert/strict";
import test from "node:test";
import { convertImportContent, MAX_IMPORT_CONTENT_BYTES } from "../plugins/native/pages/src/import-content.js";
import { pagesSchema } from "../plugins/native/pages/src/schema.js";
import type { Node } from "prosemirror-model";

function convert(content: string, format: "markdown" | "html" | "text" | "csv" = "markdown", name = "导入文档.md") {
  const converted = convertImportContent({ content, format, name });
  const doc = pagesSchema.nodeFromJSON(converted.body);
  doc.check();
  return { ...converted, doc };
}

function nodesOfType(doc: Node, type: string): Node[] {
  const nodes: Node[] = [];
  doc.descendants((node) => { if (node.type.name === type) nodes.push(node); });
  return nodes;
}

test("Markdown preserves editable headings, inline marks, blockquote, code and separators", () => {
  const { title, doc, warnings } = convert([
    "# 中文项目计划", "", "正文有 **加粗**、*斜体*、~~删除~~、`内联代码`、<u>下划线</u>和[官网](https://example.com/path)。", "",
    "#### 细节", "", "> 引用正文", "", "```ts", "const message = '你好';", "```", "", "---",
  ].join("\n"));
  assert.equal(title, "中文项目计划");
  assert.deepEqual(nodesOfType(doc, "heading").map((node) => node.attrs.level), [3]);
  for (const type of ["strong", "em", "strike", "code", "underline", "link"]) {
    assert.ok(nodesOfType(doc, "text").some((node) => node.marks.some((mark) => mark.type.name === type)), type);
  }
  assert.equal(nodesOfType(doc, "code_block")[0].attrs.language, "typescript");
  assert.equal(nodesOfType(doc, "code_block")[0].textContent, "const message = '你好';");
  assert.equal(nodesOfType(doc, "blockquote")[0].textContent, "引用正文");
  assert.equal(nodesOfType(doc, "horizontal_rule").length, 1);
  assert.ok(warnings.some((warning) => warning.includes("三级标题")));
});

test("Markdown preserves nested lists, checked tasks, mixed list items and ordered starts", () => {
  const { doc } = convert("3. 第三项\n   - 子项\n     - 孙项\n4. 第四项\n\n- [x] 已完成\n  - [ ] 子任务\n- 普通项目\n- [ ] 未完成");
  assert.equal(nodesOfType(doc, "ordered_list")[0].attrs.order, 3);
  assert.equal(nodesOfType(doc, "bullet_list").length, 3);
  assert.deepEqual(nodesOfType(doc, "task_item").map((node) => node.attrs.checked), [true, false, false]);
  assert.equal(nodesOfType(doc, "task_list").length, 3);
  assert.ok(doc.textContent.includes("孙项"));
  assert.ok(doc.textContent.includes("普通项目"));
});

test("Notion HTML preserves title, styled text, checkbox state, tables and readable relative links", () => {
  const { title, doc, warnings } = convert(`<!DOCTYPE html><html><head><title>备用标题</title><style>body {color:red}</style></head><body>
    <article><h1>知识库导出</h1><p><span style="font-weight:700;font-style:italic;text-decoration:underline">重点</span></p>
    <ul class="to-do-list"><li><span class="checkbox checkbox-on"></span>已完成</li><li><span class="checkbox checkbox-off"></span>未完成</li></ul>
    <table><thead><tr><th>名称</th><th>进度</th></tr></thead><tbody><tr><td><p>文档</p></td><td>完成</td></tr></tbody></table>
    <p><a href="子页面%20abcdef1234567890.md">子页面</a></p></article></body></html>`, "html");
  assert.equal(title, "知识库导出");
  assert.equal(nodesOfType(doc, "table_row").length, 2);
  assert.deepEqual(nodesOfType(doc, "task_item").map((node) => node.attrs.checked), [true, false]);
  assert.ok(doc.textContent.includes("子页面 abcdef1234567890.md"));
  assert.equal(nodesOfType(doc, "text").find((node) => node.text === "重点")?.marks.length, 3);
  assert.ok(warnings.some((warning) => warning.includes("相对链接")));
});

test("title falls back to HTML title or decoded filename without a Notion UUID", () => {
  assert.equal(convert("<head><title>导出的飞书文档</title></head><p>内容</p>", "html").title, "导出的飞书文档");
  assert.equal(convert("内容", "markdown", "archive/中文%20计划 0123456789abcdef0123456789abcdef.md").title, "中文 计划");
  assert.equal(convert("内容", "text", "文档 12345678-1234-1234-1234-123456789abc.txt").title, "文档");
});

test("long titles respect the store limit and retain the original heading in the body", () => {
  const original = "长标题".repeat(40);
  const { title, doc, warnings } = convert("# " + original + "\n\n正文");
  assert.equal(title.length, 80);
  assert.ok(doc.textContent.includes(original));
  assert.ok(warnings.some((warning) => warning.includes("80 字")));
});

test("only a leading H1 identical to the adopted title is removed from the body", () => {
  const { title, doc } = convert("# **项目计划**\n\n正文\n\n# 项目计划");
  assert.equal(title, "项目计划");
  assert.equal(doc.firstChild?.type.name, "paragraph");
  assert.equal(doc.firstChild?.textContent, "正文");
  assert.equal(nodesOfType(doc, "heading").length, 1);
  assert.equal(nodesOfType(doc, "heading")[0].textContent, "项目计划");

  const html = convert("<article><h1>HTML 标题</h1><p>HTML 正文</p></article>", "html");
  assert.equal(html.title, "HTML 标题");
  assert.equal(html.doc.textContent, "HTML 正文");
  assert.equal(nodesOfType(html.doc, "heading").length, 0);
});

test("title-only imports retain an editable empty paragraph", () => {
  for (const [content, format] of [["# 只有标题", "markdown"], ["<h1>只有标题</h1>", "html"]] as const) {
    const { title, doc } = convert(content, format);
    assert.equal(title, "只有标题");
    assert.equal(doc.childCount, 1);
    assert.equal(doc.firstChild?.type.name, "paragraph");
    assert.equal(doc.textContent, "");
  }
});

test("non-leading headings and headings with additional imported content stay in the body", () => {
  const later = convert("引言\n\n# 标题");
  assert.equal(later.title, "标题");
  assert.equal(nodesOfType(later.doc, "heading").length, 1);

  const secondLevel = convert("<h2>标题</h2><h1>标题</h1>", "html");
  assert.deepEqual(nodesOfType(secondLevel.doc, "heading").map((node) => node.attrs.level), [2, 1]);

  const linked = convert('<h1><a href="child.md">入口</a></h1><p>说明</p>', "html");
  assert.equal(linked.title, "入口");
  assert.equal(linked.doc.firstChild?.type.name, "heading");
  assert.equal(linked.doc.firstChild?.textContent, "入口（child.md）");
});

test("title deduplication retains first headings that carry navigable links", () => {
  for (const [content, format] of [
    ['<h1><a href="https://example.com/spec">外部规范</a></h1><p>正文</p>', "html"],
    ["# [外部规范](https://example.com/spec)\n\n正文", "markdown"],
  ] as const) {
    const { title, doc } = convert(content, format);
    assert.equal(title, "外部规范");
    assert.equal(doc.firstChild?.type.name, "heading");
    assert.equal(doc.firstChild?.firstChild?.marks.find((mark) => mark.type.name === "link")?.attrs.href, "https://example.com/spec");
  }
});

test("block-level anchors retain relative paths and apply the same URL safety rules", () => {
  const { doc, warnings } = convert('<a href="child-page.md"><div>子页面</div></a><a href="资料/%E8%AF%B4%E6%98%8E.md"><section><p>说明文档</p></section></a><a href="https://example.com/spec"><div>外部规范</div></a><a href="javascript:alert(1)"><div>不安全链接</div></a>', "html");
  assert.ok(doc.textContent.includes("子页面（child-page.md）"));
  assert.ok(doc.textContent.includes("说明文档（资料/说明.md）"));
  assert.ok(warnings.some((warning) => warning.includes("相对链接")));
  assert.ok(warnings.some((warning) => warning.includes("不安全")));
  const links = nodesOfType(doc, "text").flatMap((node) => node.marks.filter((mark) => mark.type.name === "link"));
  assert.deepEqual(links.map((mark) => mark.attrs.href), ["https://example.com/spec"]);
  assert.ok(!JSON.stringify(doc.toJSON()).includes("javascript:"));
});

test("HTML scripts and unsafe URLs never survive as executable content", () => {
  const { doc, warnings } = convert(`<p onclick="alert(1)">安全<script>throw new Error('must not run')</script>
    <a href="javascript:alert(1)">恶意链接</a><a href="data:text/html;base64,SGVsbG8=">数据</a>
    <a href="https://example.com/?a=1&amp;b=2">正常链接</a><img src="data:image/png;base64,AAAA" alt="内嵌图片"></p>`, "html");
  const json = JSON.stringify(doc.toJSON());
  assert.ok(!json.includes("javascript:"));
  assert.ok(!json.includes("must not run"));
  assert.ok(!json.includes("onclick"));
  assert.ok(!json.includes("base64"));
  const links = nodesOfType(doc, "text").flatMap((node) => node.marks.filter((mark) => mark.type.name === "link"));
  assert.deepEqual(links.map((mark) => mark.attrs.href), ["https://example.com/?a=1&b=2"]);
  assert.ok(warnings.some((warning) => warning.includes("不安全")));
  assert.ok(warnings.some((warning) => warning.includes("脚本")));
});

test("images and embeds remain visible as safe links or explicit placeholders", () => {
  const { doc, warnings } = convert('![远程图](https://example.com/photo.png)\n\n![本地图](assets/图片.png)\n\n<iframe src="https://example.com/embed" title="演示"></iframe>');
  assert.ok(doc.textContent.includes("图片：远程图"));
  assert.ok(doc.textContent.includes("assets/图片.png"));
  assert.ok(doc.textContent.includes("内嵌内容：演示"));
  assert.equal(nodesOfType(doc, "text").flatMap((node) => node.marks.filter((mark) => mark.type.name === "link")).length, 2);
  assert.ok(warnings.some((warning) => warning.includes("附件文件未保存")));
});

test("relative path labels decode Chinese and spaces without changing link safety", () => {
  const { doc } = convert("[说明](文档/使用说明.md)\n\n![图片](assets/项目%20截图.png)\n\n<a href=\"bad%E0%A4%A.md\">损坏编码</a>\n\n<a href=\"%6Aavascript%3Aalert(1)\">编码协议</a>\n\n[官网](https://example.com/%E4%B8%AD%E6%96%87)");
  assert.ok(doc.textContent.includes("文档/使用说明.md"));
  assert.ok(doc.textContent.includes("assets/项目 截图.png"));
  assert.ok(doc.textContent.includes("bad%E0%A4%A.md"));
  assert.ok(doc.textContent.includes("javascript:alert(1)"));
  const links = nodesOfType(doc, "text").flatMap((node) => node.marks.filter((mark) => mark.type.name === "link"));
  assert.deepEqual(links.map((mark) => mark.attrs.href), ["https://example.com/%E4%B8%AD%E6%96%87"]);
});

test("Markdown GFM tables remain editable tables and block embeds remain visible", () => {
  const { doc } = convert("| 名称 | 进度 |\n| --- | --- |\n| **文档** | [完成](https://example.com) |\n\n<object data=\"https://example.com/file.pdf\"><p>附件回退内容</p></object>");
  assert.equal(nodesOfType(doc, "table_row").length, 2);
  assert.equal(nodesOfType(doc, "table_header").length, 2);
  assert.ok(doc.textContent.includes("内嵌内容：object"));
  assert.ok(nodesOfType(doc, "text").some((node) => node.marks.some((mark) => mark.attrs.href === "https://example.com/file.pdf")));
});

test("merged tables and unsupported cell blocks keep all text with explicit warnings", () => {
  const { doc, warnings } = convert(`<table><caption>销售数据</caption><tr><th colspan="2">总览</th></tr><tr>
    <td rowspan="2"><h2>标题</h2><ul><li>一</li><li><a href="https://example.com">二</a></li></ul></td><td>三</td></tr><tr><td>四</td></tr></table>`, "html");
  assert.ok(doc.textContent.includes("销售数据"));
  for (const text of ["总览", "标题", "一", "二", "三", "四"]) assert.ok(doc.textContent.includes(text));
  assert.ok(warnings.some((warning) => warning.includes("合并单元格")));
  assert.ok(warnings.some((warning) => warning.includes("转为段落")));
  assert.deepEqual(nodesOfType(doc, "table_row").map((node) => node.childCount), [2, 2, 2]);
});

test("CSV preserves quoted commas, newlines, quotes, BOM and uneven rows", () => {
  const { doc, warnings } = convert('\uFEFF名称,说明\r\n项目,"第一行,逗号\n第二行"\r\n引号,"他说""你好"""\r\n末行\r\n', "csv", "数据.csv");
  assert.equal(nodesOfType(doc, "table_row").length, 4);
  assert.equal(nodesOfType(doc, "table_header").length, 2);
  assert.ok(doc.textContent.includes("第一行,逗号"));
  assert.ok(doc.textContent.includes('他说"你好"'));
  assert.equal(nodesOfType(doc, "hard_break").length, 1);
  assert.ok(warnings.some((warning) => warning.includes("列数不一致")));
  assert.throws(() => convert('列\n"未闭合', "csv"), /未闭合/u);
  assert.throws(() => convert('列\n"值"非法', "csv"), /引号后的内容/u);
});

test("plain text preserves line breaks and literal markup without interpreting HTML", () => {
  const { doc } = convert("第一行\r\n第二行\r\n\r\n<script>这是文字</script>", "text");
  assert.equal(doc.childCount, 2);
  assert.equal(nodesOfType(doc, "hard_break").length, 1);
  assert.ok(doc.textContent.includes("<script>这是文字</script>"));
});

test("empty, oversized, excessively nested and expansion-heavy imports are rejected", () => {
  assert.throws(() => convert(" \n\t"), /为空/u);
  assert.throws(() => convert("<script>1</script><p> </p>", "html"), /没有可导入/u);
  assert.throws(() => convert("a".repeat(MAX_IMPORT_CONTENT_BYTES + 1), "text"), /不能超过/u);
  assert.throws(() => convert("<div>".repeat(90) + "正文" + "</div>".repeat(90), "html"), /嵌套过深/u);
  assert.throws(() => convert("a,".repeat(200) + "a\n" + "a\n".repeat(200), "csv"), /单元格过多/u);
});
