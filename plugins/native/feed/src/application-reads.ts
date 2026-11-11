import type { FeedApplicationPorts } from "./application-ports.js";
import type { FeedItemPage } from "./contract/feed-page.js";
import { feedItemRecord } from "./application-projection.js";

/** Read projections belong to Feed. Background walks retain only one stable-key page at a time. */
export class FeedReads {
  constructor(private readonly ports: FeedApplicationPorts) {}

  page(projectId: string, page: FeedItemPage) {
    return this.ports.feed.query.list(projectId, page).map(feedItemRecord);
  }

  *items(projectId: string, sourceId?: string) {
    let after: string | undefined;
    for (;;) {
      const page = this.page(projectId, { limit: 200, offset: 0, sort: "id", after_id: after, source_id: sourceId });
      if (!page.length) return;
      yield* page;
      after = page.at(-1)!.item_id;
    }
  }

  detail(projectId: string, itemId: string, offset: number) {
    return feedItemRecord(this.ports.feed.query.get(projectId, itemId, { offset, limit: 200 }));
  }

  materials(projectId: string, itemId: string, offset = 0) {
    return this.ports.feed.query.materials(projectId, itemId, offset, 200);
  }

  *materialPages(projectId: string, itemId: string) {
    for (let offset = 0;; offset += 200) {
      const page = this.materials(projectId, itemId, offset);
      if (!page.length) return;
      yield page;
      if (page.length < 200) return;
    }
  }

  *history(projectId: string, sourceId: string, kind: "refs" | "operations") {
    let after = "";
    for (;;) {
      const page = this.ports.historyReads[kind](projectId, sourceId, after);
      if (!page.length) return;
      yield page;
      after = page.at(-1)!;
    }
  }

  facets(projectId: string) { return this.ports.feed.query.facets(projectId); }

  hasPackage(projectId: string, sourceId: string, externalId: string, hash: string) {
    return this.ports.feed.query.hasPackage(projectId, sourceId, externalId, hash);
  }
}
