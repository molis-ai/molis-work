// Sample data for the 03 shared-paths prototype. Everything here is made up; nothing reads a real Home or folder.
window.protoData = {
  project: { name: "网站改版", nameEn: "Website redesign", mono: "网" },
  // Local folders the project knows. One identity per folder; roles say what the project may do with it.
  folders: [
    {
      id: "website", name: "website", path: "~/code/website", roles: ["input", "output"],
      tree: [
        { name: "src", kind: "dir", children: [
          { name: "pages", kind: "dir", children: [
            { name: "index.tsx", kind: "code", size: "4.2 KB", lines: 138, changed: true },
            { name: "pricing.tsx", kind: "code", size: "2.9 KB", lines: 96 },
          ] },
          { name: "components", kind: "dir", children: [
            { name: "Hero.tsx", kind: "code", size: "1.8 KB", lines: 61, changed: true },
            { name: "Nav.tsx", kind: "code", size: "1.1 KB", lines: 40 },
          ] },
          { name: "styles.css", kind: "code", size: "6.4 KB", lines: 240 },
        ] },
        { name: "public", kind: "dir", children: [{ name: "logo.svg", kind: "image", size: "3 KB" }] },
        { name: "README.md", kind: "text", size: "1.2 KB", lines: 34 },
        { name: "package.json", kind: "code", size: "0.9 KB", lines: 31 },
        { name: "Dockerfile", kind: "text", size: "0.4 KB", lines: 14 },
      ],
      skipped: { count: 1834, why: "node_modules、dist、.git 默认不读", whyEn: "node_modules, dist and .git are skipped by default" },
    },
    {
      id: "brand", name: "brand-assets", path: "~/Documents/brand-assets", roles: ["input"],
      tree: [
        { name: "品牌指南 2026.pdf", kind: "pdf", size: "8.6 MB", pages: 42 },
        { name: "配色与字体.md", kind: "text", size: "3.1 KB", lines: 72 },
        { name: "首页参考", kind: "dir", children: [
          { name: "竞品 A 首屏.png", kind: "image", size: "1.4 MB" },
          { name: "竞品 B 首屏.png", kind: "image", size: "1.1 MB" },
        ] },
        { name: "旧版品牌手册.key", kind: "office", size: "52 MB", unreadable: true },
      ],
    },
  ],
  writingFolders: [
    {
      id: "interviews", name: "访谈记录", path: "~/Documents/访谈记录", roles: ["input"],
      tree: [
        { name: "用户访谈 01.docx", kind: "office", size: "220 KB", pages: 6 },
        { name: "用户访谈 02.docx", kind: "office", size: "198 KB", pages: 5 },
        { name: "访谈提纲.md", kind: "text", size: "2.0 KB", lines: 48 },
      ],
    },
  ],
  defaultOutput: "~/Molis Work/网站改版",
  imports: [
    { name: "竞品调研.pdf", kind: "pdf", size: "2.3 MB", pages: 18, when: "昨天导入", whenEn: "Imported yesterday" },
    { name: "用户反馈汇总.xlsx", kind: "office", size: "410 KB", when: "3 天前导入", whenEn: "Imported 3 days ago", parseFailed: true },
  ],
  content: [
    { name: "改版方案", owner: "Pages", kind: "page", when: "今天 10:12 编辑", whenEn: "Edited today 10:12" },
    { name: "首屏文案三版", owner: "Shelf", kind: "note", when: "今天 09:40 收进", whenEn: "Kept today 09:40" },
    { name: "首页改版报告 v1", owner: "成果", ownerEn: "Artifacts", kind: "artifact", when: "固定版本 · 10-30", whenEn: "Fixed version · 10-30" },
  ],
  recent: ["品牌指南 2026.pdf", "index.tsx", "改版方案", "首屏文案三版", "Hero.tsx"],
  task: { title: "首页改版：换成新的首屏", titleEn: "Home redesign: new hero", status: "running" },
  previews: {
    "index.tsx": "import { Hero } from \"../components/Hero\";\nimport { Nav } from \"../components/Nav\";\n\nexport default function Home() {\n  return (\n    <main>\n      <Nav />\n      <Hero title=\"把工作接着做下去\" />\n    </main>\n  );\n}",
    "Hero.tsx": "export function Hero({ title }: { title: string }) {\n  return (\n    <section className=\"hero\">\n      <h1>{title}</h1>\n      <p>本机优先，你的资料留在你的电脑上。</p>\n    </section>\n  );\n}",
    "品牌指南 2026.pdf": "第 3 页 · 主色与留白\n\n首屏只放一句主张和一个主操作。主色用于主操作，不用于大面积背景。标题字重 600，正文 400。\n\n第 4 页 · 图片\n\n人物图片不裁切面部；产品截图保留真实界面，不加装饰边框。",
    "配色与字体.md": "# 配色与字体\n\n- 主色：墨蓝 #2d4f6c\n- 强调：雾蓝 #3c6e98\n- 标题：600，正文：400\n- 首屏标题不超过 18 个字",
    "README.md": "# website\n\n公司官网。`pnpm dev` 启动，`pnpm test` 跑测试。",
    "访谈提纲.md": "# 访谈提纲\n\n1. 你现在怎样整理项目资料？\n2. 哪一步最常卡住？\n3. 换电脑或重开之后，最怕丢掉什么？",
    "竞品调研.pdf": "第 1 页 · 摘要\n\n三家竞品的首屏都用一句话主张加一个按钮；两家把价格放在第二屏。",
    "改版方案": "改版方案（Pages）\n\n目标：首屏一句话讲清本机优先；第二屏放三个真实场景。",
    "首屏文案三版": "1. 把工作接着做下去\n2. 资料在你手里，AI 在你身边\n3. 一个地方，接上所有正在做的事",
    "首页改版报告 v1": "首页改版报告 v1（固定版本，10-30）\n\n结论：新版首屏点击率预计提升，需真实数据验证。",
  },
};
