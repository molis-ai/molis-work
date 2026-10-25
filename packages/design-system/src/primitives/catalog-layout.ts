// The catalog board's directory panel and shell-layout specimens.
import { renderButton, renderCard, renderDirectoryHeading, renderDirectoryPanel, renderDirectoryRow, renderEmpty, renderFrame, renderGroup, renderScrollArea, renderSidebar, renderTable } from "@molis-ai/molis-work-plugin-sdk/ui";
import { mark, section, specimen } from "./catalog-parts.js";

export function directorySection(): string {
  const catalogDirTools = renderButton({ label: "筛选", variant: "ghost", size: "icon", icon: "filter", iconOnly: true })
    + renderButton({ label: "搜索", variant: "ghost", size: "icon", icon: "search", iconOnly: true });
  const catalogDirRows = renderDirectoryRow({
    title: "全部",
    caption: "所有来源的流水",
    icon: "rss",
    count: 12,
    density: "meta",
  }) + renderDirectoryHeading("拉取任务") + renderDirectoryRow({
    title: "设计观察",
    caption: "10 分钟前",
    status: "运行中",
    statusTone: "progress",
    statusIcon: "check",
    icon: "refresh",
    count: 4,
    density: "meta",
    current: true,
    trailing: renderButton({ label: "任务配置", variant: "ghost", size: "icon", icon: "more", iconOnly: true }),
  }) + renderDirectoryRow({
    title: "runtime / 本地会话",
    caption: "本地 Runtime",
    status: "可查看",
    statusTone: "idle",
    statusIcon: "ready",
    icon: "refresh",
    count: 2,
    density: "meta",
  }) + renderDirectoryRow({
    title: "确认对象边界",
    caption: "你手工加入",
    status: "待处理",
    statusTone: "attention",
    statusIcon: "bell",
    icon: "refresh",
    count: 1,
    density: "meta",
  });
  const catalogDirectory = renderDirectoryPanel({
    pluginId: "catalog",
    label: "Feed",
    listLabel: "目录示例",
    listRole: "none",
    tools: catalogDirTools,
    body: catalogDirRows,
    add: { label: "添加任务" },
  });
  const catalogCompact = renderDirectoryPanel({
    pluginId: "catalog-compact",
    label: "Sessions",
    listLabel: "会话",
    listRole: "none",
    body: renderDirectoryRow({
      title: "runtime / 本地会话",
      status: "可查看",
      statusTone: "idle",
      statusIcon: "ready",
      density: "compact",
      current: true,
    }) + renderDirectoryRow({
      title: "确认对象边界",
      status: "待处理",
      statusTone: "attention",
      statusIcon: "bell",
      density: "compact",
    }) + renderDirectoryRow({
      title: "quarterly-planning-notes-and-a-very-long-session-name",
      status: "可查看",
      statusTone: "idle",
      statusIcon: "ready",
      density: "compact",
    }),
    add: { label: "新建 Session" },
  });
  const catalogDirectoryEmpty = renderDirectoryPanel({
    pluginId: "catalog-empty",
    label: "Feed",
    listLabel: "空目录",
    listRole: "none",
    body: "",
    empty: renderEmpty({
      icon: "rss",
      title: "还没有拉取任务",
      body: "添加一个来源后，新内容会出现在这里。",
    }),
    add: { label: "添加任务" },
  });
  const yieldOps = renderButton({ label: "复制", variant: "ghost", size: "icon", icon: "copy", iconOnly: true })
    + renderButton({ label: "隐藏", variant: "ghost", size: "icon", icon: "x", iconOnly: true })
    + renderButton({ label: "删除副本", variant: "ghost", size: "icon", icon: "trash", iconOnly: true });
  const catalogYield = renderDirectoryPanel({
    pluginId: "catalog-yield",
    label: "材料",
    listLabel: "行让位",
    listRole: "none",
    body: renderDirectoryRow({
      title: "试用示例.pdf",
      icon: "file",
      density: "compact",
      fileName: true,
      yield: true,
      trailing: yieldOps,
    }) + renderDirectoryRow({
      title: "quarterly-planning-notes-and-a-very-long-working-copy-filename.pdf",
      icon: "file",
      density: "compact",
      current: true,
      fileName: true,
      yield: true,
      trailing: yieldOps,
    }),
  });
  return section("directory", "Directory Panel / Row", `<p class="mw-catalog__hint">目录行 hover 是 180ms 让位，不是一块跟着鼠标走的底片。长标题在标题槽里省略，行尾状态完整留下；带行尾动作的行用 <code>yield</code>，静止不预留动作槽。</p>
      <div class="mw-catalog__specimens">${specimen("目录栏", `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogDirectory}</div></div>`)}${specimen("单行", `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogCompact}</div></div>`)}${specimen("行让位", `<div class="mw-catalog-dir-stage is-yield"><div class="mw-catalog-dir">${catalogYield}</div></div>`)}${specimen("空态", `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogDirectoryEmpty}</div></div>`)}</div>`);
}

export function layoutSection(): string {
  const catalogDirTools = renderButton({ label: "筛选", variant: "ghost", size: "icon", icon: "filter", iconOnly: true })
    + renderButton({ label: "搜索", variant: "ghost", size: "icon", icon: "search", iconOnly: true });
  const catalogShellDirectory = renderDirectoryPanel({
    pluginId: "catalog-shell",
    label: "Feed",
    listLabel: "目录示例",
    listRole: "none",
    tools: catalogDirTools,
    body: renderDirectoryRow({
      title: "全部",
      caption: "所有来源的流水",
      icon: "rss",
      count: 12,
      density: "meta",
    }) + renderDirectoryHeading("拉取任务") + renderDirectoryRow({
      title: "设计观察",
      caption: "10 分钟前",
      status: "运行中",
      statusTone: "progress",
      statusIcon: "check",
      icon: "refresh",
      count: 4,
      density: "meta",
      current: true,
      trailing: renderButton({ label: "任务配置", variant: "ghost", size: "icon", icon: "more", iconOnly: true }),
    }) + renderDirectoryRow({
      title: "确认对象边界",
      caption: "你手工加入",
      status: "待处理",
      statusTone: "attention",
      statusIcon: "bell",
      icon: "refresh",
      count: 1,
      density: "meta",
    }),
    add: { label: "添加任务" },
  });
  const catalogShell = `<div class="mw-catalog-shell">${mark("sidebar", renderSidebar({
    variant: "rail",
    body: renderButton({ label: "Goals", variant: "ghost", size: "icon", icon: "target", iconOnly: true, attrs: { "data-plugin-id": "goals" } })
      + renderButton({
        label: "Feed",
        variant: "ghost",
        size: "icon",
        icon: "rss",
        iconOnly: true,
        attrs: { "aria-current": "page", "data-plugin-id": "feed" },
      }),
  }) + renderSidebar({
    variant: "directory",
    body: catalogShellDirectory,
  }))}${mark("frame", renderFrame({
    title: "设计观察",
    description: "运行中 · 当前任务的流水",
    action: renderButton({ label: "添加已有内容", variant: "link", size: "sm" }),
    panel: "<p>第一次打开这条任务时，人会先扫目录里哪一条是当前的，再落到纸面上的流水。</p><p>栏留在灰色里，正文自己发亮。页眉和正文靠间距分开，不要再画一条线把它们切成两块。</p>",
  }))}</div>`;
  return section("layout", "Sidebar / Frame / Group / Card / Scroll Area / Table", `<div class="mw-catalog__specimens">${specimen("栏与内容框", catalogShell)}${mark("group", specimen("成组工具", renderGroup({
      label: "历史",
      body: renderButton({ label: "上一步", variant: "ghost", size: "icon", icon: "back", iconOnly: true })
        + renderButton({ label: "下一步", variant: "ghost", size: "icon", icon: "arrow", iconOnly: true }),
    })))}${mark("card", specimen("卡片", renderCard({
      title: "快捷方式",
      description: "打开常用入口。",
      body: "<p>添加快捷方式后显示在这里。</p>",
      footer: renderButton({ label: "添加", variant: "secondary", size: "sm" }),
    })))}${mark("scroll-area", specimen("内部滚动", renderScrollArea({
      className: "mw-catalog-scroll",
      body: "<p>目录超过这一屏高度后，只在栏内滚动，外面的工作区不动。</p><p>第二段用来把滚动条唤醒：行与行仍然贴紧，组和组才拉开。</p><p>纸面用发丝线围住，不是描边玩具盒。</p><p>再往下还有一屏，确认 overflow 真的发生。</p>",
    })))}${mark("table", specimen("表格", renderTable({
      head: ["Goal", "状态", "下一步"],
      rows: [["统一控件语言", "进行中", "收口旧 class"], ["Home 月历", "可用", "接 Calendar"]],
    })))}</div>`);
}
