// All names, contents, permissions and activity in the study are fixtures.
export const taskTitle = "官网首屏文案";
export const taskDraft = "把首屏按钮改成「预约参观」，再核对手机上按钮能不能完整显示。";
export const assistantReply = "首屏按钮在 Hero.tsx。我找到了品牌指南，里面有关于首屏文案和手机布局的要求。你可以把其中一段加到这次任务里。";

export const sources = {
  website: { name: "website", path: "~/Projects/website", roles: ["reference", "output"] },
  next: { name: "website-v2", path: "~/Projects/website-v2", roles: ["output"] },
  brand: { name: "brand-assets", path: "~/Projects/brand-assets", roles: ["reference"] },
  imported: { name: "导入的文件", english: "Imported files" },
  pages: { name: "Pages" },
  shelf: { name: "Shelf" },
  artifact: { name: "成果库", english: "Library" },
};

export const files = {
  hero: { root: "website", path: "src/components/Hero.tsx", size: "1.4 KB", kind: "code" },
  styles: { root: "website", path: "src/styles/home.css", size: "1.1 KB", kind: "code" },
  readme: { root: "website", path: "README.md", size: "0.8 KB", kind: "text" },
  build: { root: "website", path: "reports/build.log", size: "186 KB", kind: "log" },
  guide: { root: "brand", path: "品牌指南.md", size: "4.2 KB", kind: "text" },
  copy: { root: "brand", path: "文案/首屏文案.md", size: "1.3 KB", kind: "text" },
  visits: { root: "imported", path: "访谈纪要.txt", size: "2.2 KB", kind: "text" },
  spec: { root: "imported", path: "Preview checklist.pdf", size: "240 KB", kind: "text", pages: 2 },
  brief: { root: "pages", path: "官网改版需求", kind: "text" },
  note: { root: "shelf", path: "三家场馆的预约动线", kind: "text" },
  receipt: { root: "artifact", path: "旧版官网检查报告", kind: "text", fixed: true },
};

export const folderTrees = {
  website: [
    { name: "src", children: [
      { name: "components", children: ["hero"] },
      { name: "styles", children: ["styles"] },
    ] },
    { name: "reports", children: ["build"] },
    "readme",
  ],
  brand: ["guide", { name: "文案", children: ["copy"] }],
  next: [],
};

export const defaultRecent = ["guide", "hero", "brief"];
export const worktreeName = "website-copy";
export const logLines = 2400;
export const logPreviewLines = 120;

const guide = [
  ["首屏只说一件事", [
    "第一次来的访客只需要知道三件事：渡口是什么、现在能做什么、到了那里会遇见谁。首屏先邀请来参观，把开放时间、地址和无障碍信息留在下一段。",
    "主标题用「在河边见一面」，副标题可以告诉访客：这里是江畔一座由旧仓库改成的公共工作室。下午的阳光从北窗进来，前台志愿者会带你走一圈。",
  ]],
  ["按钮怎么写", [
    "首屏主按钮用「预约参观」。按钮旁的说明写「每周四至周日开放」；需要补充时，把开放时段放在按钮下方。",
    "移动端优先把预约动作放在首屏。只保留一个主按钮，地址放到下一段，保证按钮文字在 390 像素的画面里完整显示。",
  ]],
  ["用接待人的语气", [
    "写得像前台志愿者在跟第一次来的人说话。用具体的动词和可感知的细节，比如「从南门进来」「到窗边领地图」。一句里可以讲一件事，读的人可以边走边看。",
    "如果人数已经满了，告诉访客下一场什么时候开放，并给他们一个回到日期列表的入口。这个时候人的需求是找一个还能来的时段，先回答那件事。",
  ]],
  ["给到达的人留一盏灯", [
    "周六下午人最多，入口旁有三张长凳。预约邮件附上南门的照片，雨天可以沿着屋檐走到门厅。需要无障碍通道的人从东侧坡道进，志愿者会在门内等。",
    "内容上线后用手机走一遍。从首页进入预约，改选时段，收到确认，再从确认回到项目介绍。让一位没有来过渡口的人读完后复述路线。",
  ]],
  ["图片和说明", [
    "首屏照片尽量选入口有人的一张。文字下面留出足够的空气，保证窄屏上的字落在颜色安静的位置。",
    "图片描述要说明人能借此认出什么，例如「南门旁立着一块手写开放时间的木板」。与上文已经说过的内容可以省去。",
  ]],
];

const texts = {
  guide: { title: "渡口品牌指南", sections: guide },
  copy: { title: "首页文案", sections: [
    ["首屏", ["在河边见一面", "渡口是江畔一座由旧仓库改成的公共工作室。每周四至周日开放。"]],
    ["预约", ["预约参观", "选一个合适的下午。参观大约四十五分钟，入口的志愿者会带你熟悉这里。"]],
  ] },
  readme: { title: "渡口官网", sections: [
    ["本地预览", ["用 pnpm dev 启动开发页面。首页组件位于 src/components/Hero.tsx。"]],
    ["发布检查", ["用 390、1024 和 1440 三种宽度检查首屏。在提交前核对预约链接和开放时段。"]],
  ] },
  visits: { title: "首轮访谈纪要", sections: [
    ["第一次来", ["受访者 C 在手机上没找到入口地图。她从开放时间猜测可以直接来，走到南门后才知道需要预约。"]],
    ["下一次预约", ["两位受访者想知道同行人数能不能一起选。三位在日期已满时希望可以直接跳到下一场。"]],
  ] },
  spec: { title: "Preview checklist", sections: [
    ["1. Before publishing", ["Open the booking form from the home page and check the available dates. Verify that the button text fits at 390 px."]],
    ["2. On arrival", ["Check the address and the step-free route from the booking confirmation. Test the return link after switching dates."]],
  ] },
  brief: { title: "官网改版需求", sections: [
    ["这一轮", ["让第一次来的访客在首屏找到预约入口，清楚知道什么时候开放。保留地图和无障碍入口的信息。"]],
    ["验收", ["390 像素下主按钮完整。浏览预约日期后能回到原页面。旧版检查报告留在项目里供对照。"]],
  ] },
  note: { title: "三家场馆的预约动线", sections: [
    ["观察", ["A 场馆从首页到选日期只要一步。B 场馆先展示三种参观方式，适合有明确目的的人。C 场馆把地址放在预约确认里，第一次到访的人很容易错过。"]],
    ["给渡口", ["把预约时段放在动作之后，让首屏主按钮清楚可见。"]],
  ] },
  receipt: { title: "旧版官网检查报告", sections: [
    ["手机首屏", ["390 像素下「了解更多」按钮会和开放时段挤在同一行。按钮点开的是介绍页，访客还需要滚到最下方才能预约。"]],
    ["待修", ["更新主按钮文案及地址，并保留旧版截图作为比较。"]],
  ] },
};

// Classify the few literal code samples for the reader without bundling a second tokenizer.
const line = (...parts) => parts;
const keyword = (value) => ["keyword", value];
const string = (value) => ["string", value];
const comment = (value) => ["comment", value];
const code = {
  hero: [
    line(keyword("import"), " { BookingLink } ", keyword("from"), " ", string('"./BookingLink"'), ";"),
    line(),
    line(keyword("export function"), " Hero() {"),
    line("  ", keyword("return"), " ("),
    line("    <section className=", string('"hero"'), ">"),
    line("      <div className=", string('"hero__body"'), ">"),
    line("        <h1>在河边见一面</h1>"),
    line("        <p>渡口是江畔一座公共工作室。</p>"),
    line("        <BookingLink href=", string('"/visit"'), ">"),
    line("          了解更多"),
    line("        </BookingLink>"),
    line("        <small>每周四至周日开放</small>"),
    line("      </div>"),
    line("    </section>"),
    line("  );"),
    line("}"),
  ],
  styles: [
    line(".hero {"),
    line("  display: grid;"),
    line("  align-items: center;"),
    line("  padding-block: clamp(2rem, 6vw, 6rem);"),
    line("}"),
    line(),
    line(comment("/* Keep the booking action visible on phones. */")),
    line("@media (width <= 640px) {"),
    line("  .hero__body {"),
    line("    max-inline-size: 32rem;"),
    line("  }"),
    line("}"),
  ],
};

export function documentFor(id, revision) {
  if (id !== "guide" || revision !== 2) return texts[id];
  return { ...texts.guide, sections: guide.map(([title, paragraphs], index) => index !== 1
    ? [title, paragraphs]
    : [title, [
      "首屏主按钮用「预约参观」。按钮旁的说明写「周四至周日 12:00–18:00 开放」，现场接待在闭馆前四十五分钟结束。",
      paragraphs[1],
    ]]) };
}

export function codeFor(id, count, origin) {
  if (id === "hero" && origin === worktreeName) {
    const lines = [...code.hero];
    lines[9] = line("          预约参观");
    return lines;
  }
  if (id !== "build") return code[id];
  const routes = ["/", "/visit", "/about", "/access", "/calendar", "/news"];
  return Array.from({ length: count }, (_, index) => line(
    `[10:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}] `,
    keyword(index % 40 === 0 ? "CHECK " : "INFO  "),
    `rendered ${routes[index % routes.length]} · visit-web-${String(index + 1).padStart(4, "0")} · ${18 + index % 17}ms\n`.trimEnd(),
  ));
}

export const fileName = (id) => files[id].path.split("/").at(-1);
