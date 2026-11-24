// The catalog board's directory panel and shell-layout specimens.
import { escapeHtml, renderButton, renderCard, renderDirectoryHeading, renderDirectoryPanel, renderDirectoryRow, renderEmpty, renderFrame, renderGroup, renderScrollArea, renderSidebar, renderTable } from "@molis-ai/molis-work-plugin-sdk/ui";
import { mark, resolveCatalogSay, section, specimen, type CatalogSay } from "./catalog-parts.js";

export function directorySection(say: CatalogSay = resolveCatalogSay()): string {
  const catalogDirTools = renderButton({ label: say("workbench.catalog-board.ds.dir-tool-filter"), variant: "ghost", size: "icon", icon: "filter", iconOnly: true })
    + renderButton({ label: say("workbench.catalog-board.ds.dir-tool-search"), variant: "ghost", size: "icon", icon: "search", iconOnly: true });
  const localSessionTitle = say("workbench.catalog-board.ds.dir-local-session");
  const viewableStatus = say("workbench.catalog-board.ds.dir-status-viewable");
  const boundaryTitle = say("workbench.catalog-board.ds.dir-task-boundary");
  const pendingStatus = say("workbench.catalog-board.ds.dir-status-pending");
  const addTaskLabel = say("workbench.catalog-board.ds.dir-add-task");
  const yieldLabel = say("workbench.catalog-board.ds.dir-yield-label");
  const catalogDirRows = renderDirectoryRow({
    title: say("workbench.catalog-board.ds.dir-all-title"),
    caption: say("workbench.catalog-board.ds.dir-all-caption"),
    icon: "rss",
    count: 12,
    density: "meta",
  }) + renderDirectoryHeading(say("workbench.catalog-board.ds.dir-heading-tasks")) + renderDirectoryRow({
    title: say("workbench.catalog-board.ds.dir-task-design"),
    caption: say("workbench.catalog-board.ds.dir-time-10m"),
    status: say("workbench.settings-call-diagnostics.running"),
    statusTone: "progress",
    statusIcon: "check",
    icon: "refresh",
    count: 4,
    density: "meta",
    current: true,
    trailing: renderButton({ label: say("workbench.catalog-board.ds.dir-task-config"), variant: "ghost", size: "icon", icon: "more", iconOnly: true }),
  }) + renderDirectoryRow({
    title: localSessionTitle,
    caption: say("workbench.catalog-board.ds.dir-ai-tools"),
    status: viewableStatus,
    statusTone: "idle",
    statusIcon: "ready",
    icon: "refresh",
    count: 2,
    density: "meta",
  }) + renderDirectoryRow({
    title: boundaryTitle,
    caption: say("workbench.catalog-board.ds.dir-added-manually"),
    status: pendingStatus,
    statusTone: "attention",
    statusIcon: "bell",
    icon: "refresh",
    count: 1,
    density: "meta",
  });
  const catalogDirectory = renderDirectoryPanel({
    pluginId: "catalog",
    label: "Feed",
    listLabel: say("workbench.catalog-board.ds.dir-list-example"),
    listRole: "none",
    tools: catalogDirTools,
    body: catalogDirRows,
    add: { label: addTaskLabel },
  });
  const catalogCompact = renderDirectoryPanel({
    pluginId: "catalog-compact",
    label: "Sessions",
    listLabel: say("workbench.catalog-board.ds.dir-list-sessions"),
    listRole: "none",
    body: renderDirectoryRow({
      title: localSessionTitle,
      status: viewableStatus,
      statusTone: "idle",
      statusIcon: "ready",
      density: "compact",
      current: true,
    }) + renderDirectoryRow({
      title: boundaryTitle,
      status: pendingStatus,
      statusTone: "attention",
      statusIcon: "bell",
      density: "compact",
    }) + renderDirectoryRow({
      title: "quarterly-planning-notes-and-a-very-long-session-name",
      status: viewableStatus,
      statusTone: "idle",
      statusIcon: "ready",
      density: "compact",
    }),
    add: { label: say("workbench.catalog-board.ds.dir-new-session") },
  });
  const catalogDirectoryEmpty = renderDirectoryPanel({
    pluginId: "catalog-empty",
    label: "Feed",
    listLabel: say("workbench.catalog-board.ds.dir-list-empty"),
    listRole: "none",
    body: "",
    empty: renderEmpty({
      icon: "rss",
      title: say("workbench.catalog-board.ds.dir-empty-title"),
      body: say("workbench.catalog-board.ds.dir-empty-body"),
    }),
    add: { label: addTaskLabel },
  });
  const yieldOps = renderButton({ label: say("workbench.catalog-board.ds.dir-op-copy"), variant: "ghost", size: "icon", icon: "copy", iconOnly: true })
    + renderButton({ label: say("workbench.catalog-board.ds.dir-op-hide"), variant: "ghost", size: "icon", icon: "x", iconOnly: true })
    + renderButton({ label: say("workbench.catalog-board.ds.dir-op-delete-copy"), variant: "ghost", size: "icon", icon: "trash", iconOnly: true });
  const catalogYield = renderDirectoryPanel({
    pluginId: "catalog-yield",
    label: say("workbench.catalog-board.ds.dir-materials-label"),
    listLabel: yieldLabel,
    listRole: "none",
    body: renderDirectoryRow({
      title: say("workbench.catalog-board.ds.dir-sample-pdf"),
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
  return section("directory", "Directory Panel / Row", `
      <div class="mw-catalog__specimens">${specimen(escapeHtml(say("workbench.catalog-board.ds.dir-spec-panel")), `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogDirectory}</div></div>`)}${specimen(escapeHtml(say("workbench.catalog-board.ds.dir-spec-compact")), `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogCompact}</div></div>`)}${specimen(escapeHtml(yieldLabel), `<div class="mw-catalog-dir-stage is-yield"><div class="mw-catalog-dir">${catalogYield}</div></div>`)}${specimen(escapeHtml(say("workbench.catalog-board.ds.dir-spec-empty")), `<div class="mw-catalog-dir-stage"><div class="mw-catalog-dir">${catalogDirectoryEmpty}</div></div>`)}</div>`);
}

export function layoutSection(say: CatalogSay = resolveCatalogSay()): string {
  const catalogDirTools = renderButton({ label: say("workbench.catalog-board.ds.dir-tool-filter"), variant: "ghost", size: "icon", icon: "filter", iconOnly: true })
    + renderButton({ label: say("workbench.catalog-board.ds.dir-tool-search"), variant: "ghost", size: "icon", icon: "search", iconOnly: true });
  const designTitle = say("workbench.catalog-board.ds.dir-task-design");
  const catalogShellDirectory = renderDirectoryPanel({
    pluginId: "catalog-shell",
    label: "Feed",
    listLabel: say("workbench.catalog-board.ds.dir-list-example"),
    listRole: "none",
    tools: catalogDirTools,
    body: renderDirectoryRow({
      title: say("workbench.catalog-board.ds.dir-all-title"),
      caption: say("workbench.catalog-board.ds.dir-all-caption"),
      icon: "rss",
      count: 12,
      density: "meta",
    }) + renderDirectoryHeading(say("workbench.catalog-board.ds.dir-heading-tasks")) + renderDirectoryRow({
      title: designTitle,
      caption: say("workbench.catalog-board.ds.dir-time-10m"),
      status: say("workbench.settings-call-diagnostics.running"),
      statusTone: "progress",
      statusIcon: "check",
      icon: "refresh",
      count: 4,
      density: "meta",
      current: true,
      trailing: renderButton({ label: say("workbench.catalog-board.ds.dir-task-config"), variant: "ghost", size: "icon", icon: "more", iconOnly: true }),
    }) + renderDirectoryRow({
      title: say("workbench.catalog-board.ds.dir-task-boundary"),
      caption: say("workbench.catalog-board.ds.dir-added-manually"),
      status: say("workbench.catalog-board.ds.dir-status-pending"),
      statusTone: "attention",
      statusIcon: "bell",
      icon: "refresh",
      count: 1,
      density: "meta",
    }),
    add: { label: say("workbench.catalog-board.ds.dir-add-task") },
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
    title: designTitle,
    description: say("workbench.catalog-board.ds.layout-frame-desc"),
    action: renderButton({ label: say("workbench.catalog-board.ds.layout-add-existing"), variant: "link", size: "sm" }),
    panel: `<p>${escapeHtml(say("workbench.catalog-board.ds.layout-frame-p1"))}</p><p>${escapeHtml(say("workbench.catalog-board.ds.layout-frame-p2"))}</p>`,
  }))}</div>`;
  return section("layout", "Sidebar / Frame / Group / Card / Scroll Area / Table", `<div class="mw-catalog__specimens">${specimen(escapeHtml(say("workbench.catalog-board.ds.layout-spec-shell")), catalogShell)}${mark("group", specimen(escapeHtml(say("workbench.catalog-board.ds.layout-spec-group")), renderGroup({
      label: say("workbench.catalog-board.ds.layout-group-history"),
      body: renderButton({ label: say("workbench.catalog-board.ds.layout-group-prev"), variant: "ghost", size: "icon", icon: "back", iconOnly: true })
        + renderButton({ label: say("workbench.catalog-board.ds.layout-group-next"), variant: "ghost", size: "icon", icon: "arrow", iconOnly: true }),
    })))}${mark("card", specimen(escapeHtml(say("workbench.catalog-board.ds.layout-spec-card")), renderCard({
      title: say("workbench.catalog-board.ds.layout-card-title"),
      description: say("workbench.catalog-board.ds.layout-card-desc"),
      body: `<p>${escapeHtml(say("workbench.catalog-board.ds.layout-card-body"))}</p>`,
      footer: renderButton({ label: say("workbench.catalog-board.ds.layout-card-add"), variant: "secondary", size: "sm" }),
    })))}${mark("surface-slot", specimen(escapeHtml(say("workbench.catalog-board.ds.layout-spec-slot")), `<div role="group" aria-label="${escapeHtml(say("workbench.catalog-board.ds.layout-slot-aria"))}">${renderCard({
      title: say("workbench.catalog-board.ds.layout-slot-title"),
      description: say("workbench.catalog-board.ds.layout-slot-desc"),
      body: `<p>${escapeHtml(say("workbench.catalog-board.ds.layout-slot-body"))}</p>`,
    })}</div>`))}${mark("scroll-area", specimen(escapeHtml(say("workbench.catalog-board.ds.layout-spec-scroll")), renderScrollArea({
      className: "mw-catalog-scroll",
      body: `<p>${escapeHtml(say("workbench.catalog-board.ds.layout-scroll-p1"))}</p><p>${escapeHtml(say("workbench.catalog-board.ds.layout-scroll-p2"))}</p><p>${escapeHtml(say("workbench.catalog-board.ds.layout-scroll-p3"))}</p><p>${escapeHtml(say("workbench.catalog-board.ds.layout-scroll-p4"))}</p>`,
    })))}${mark("table", specimen(escapeHtml(say("workbench.catalog-board.ds.layout-spec-table")), renderTable({
      head: ["Goal", say("workbench.catalog-board.ds.layout-table-col-status"), say("workbench.catalog-board.ds.layout-table-col-next")],
      rows: [
        [say("workbench.catalog-board.ds.layout-table-r1-goal"), say("workbench.assistant-delivery.progress"), say("workbench.catalog-board.ds.layout-table-r1-next")],
        [say("workbench.catalog-board.ds.layout-table-r2-goal"), say("workbench.catalog-board.ds.layout-table-r2-status"), say("workbench.catalog-board.ds.layout-table-r2-next")],
      ],
    })))}</div>`);
}
