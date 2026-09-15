/**
 * Molis Work-owned public RSS catalog, migrated from Relay.
 *
 * Base list comes from `@adeptify/search-evidence-layer` MEDIA_FEED_SOURCES.
 * We append additional working public feeds, attach categories, and honest
 * limitations (e.g. 36氪 HTML WAF — not "no messages").
 */

import { listEnabledFeedSources } from "@adeptify/search-evidence-layer/feeds";

/** Closed product categories for Sources UI grouping/filter. */
export type FeedCategory =
  | "finance"
  | "tech_cn"
  | "tech_global"
  | "science"
  | "security"
  | "ai_research"
  | "dev"
  | "policy"
  | "general_news";

export const FEED_CATEGORY_LABEL: Record<FeedCategory, string> = {
  finance: "金融 / 财经",
  tech_cn: "中文科技",
  tech_global: "国际科技",
  science: "科学 / 健康",
  security: "安全",
  ai_research: "AI / 研究",
  dev: "工程 / 开发",
  policy: "央行 / 政策",
  general_news: "综合新闻",
};

/** Display order for category chips (unknown categories sort last). */
export const FEED_CATEGORY_ORDER: readonly FeedCategory[] = Object.freeze([
  "finance",
  "policy",
  "tech_cn",
  "tech_global",
  "ai_research",
  "dev",
  "security",
  "science",
  "general_news",
]);

export interface FeedSourceCatalogEntry {
  sourceId: string;
  name: string;
  feedUrl: string;
  format: "rss" | "atom";
  paywall: "none" | "partial" | "full";
  enabled: boolean;
  category: FeedCategory;
  limitations?: readonly string[];
}

const KR36_LIMITATIONS = Object.freeze([
  "许多网络环境下 https://36kr.com/feed 会返回 HTML 风控页（火山引擎等），不是 RSS 空流",
  "若同步失败并提示 feed_blocked_html / feed_not_rss，请改用其他可公开订阅的源",
  "Molis Work 不会绕过验证码或把 HTML 伪造成文章列表",
]);

/** SDK sourceId → category when merging base registry. */
const SDK_CATEGORY: Record<string, FeedCategory> = {
  "36kr": "tech_cn",
  sspai: "tech_cn",
  "infoq-cn": "tech_cn",
  techcrunch: "tech_global",
  theverge: "tech_global",
  arstechnica: "tech_global",
  cnbc: "finance",
  reuters: "finance",
  wsj: "finance",
  bloomberg: "finance",
  ft: "finance",
};

/** Extra allowlisted feeds (smoke-verified XML where possible). */
const MOLIS_WORK_EXTRA_FEEDS: readonly FeedSourceCatalogEntry[] = Object.freeze([
  // —— 中文科技 ——
  feed({
    sourceId: "solidot",
    name: "Solidot",
    feedUrl: "https://www.solidot.org/index.rss",
    category: "tech_cn",
    limitations: ["中文科技资讯公开 RSS"],
  }),
  feed({
    sourceId: "ithome",
    name: "IT之家",
    feedUrl: "https://www.ithome.com/rss/",
    category: "tech_cn",
    limitations: ["中文科技资讯公开 RSS"],
  }),
  // —— 金融 / 财经 ——
  feed({
    sourceId: "cnbc-finance",
    name: "CNBC Finance",
    feedUrl: "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    category: "finance",
    limitations: ["CNBC 财经频道公开 RSS 摘要"],
  }),
  feed({
    sourceId: "marketwatch-top",
    name: "MarketWatch Top Stories",
    feedUrl: "https://feeds.marketwatch.com/marketwatch/topstories/",
    category: "finance",
    limitations: ["MarketWatch 头条公开 RSS"],
  }),
  feed({
    sourceId: "yahoo-finance",
    name: "Yahoo Finance News",
    feedUrl: "https://finance.yahoo.com/news/rssindex",
    category: "finance",
    paywall: "partial",
    limitations: ["Yahoo Finance 新闻索引 RSS；条目量与字段因地区而异"],
  }),
  feed({
    sourceId: "investing-news",
    name: "Investing.com News",
    feedUrl: "https://www.investing.com/rss/news.rss",
    category: "finance",
    limitations: ["Investing.com 公开新闻 RSS"],
  }),
  feed({
    sourceId: "ft-home",
    name: "Financial Times (Home)",
    feedUrl: "https://www.ft.com/rss/home",
    category: "finance",
    paywall: "full",
    limitations: ["FT 首页 RSS；全文多需订阅，仅作标题/链接参考"],
  }),
  feed({
    sourceId: "economist-finance",
    name: "The Economist · Finance & economics",
    feedUrl: "https://www.economist.com/finance-and-economics/rss.xml",
    category: "finance",
    paywall: "full",
    limitations: ["经济学人财经栏目 RSS；全文多需订阅，仅作标题/链接参考"],
  }),
  feed({
    sourceId: "seeking-alpha",
    name: "Seeking Alpha · Market Currents",
    feedUrl: "https://seekingalpha.com/market_currents.xml",
    category: "finance",
    paywall: "partial",
    limitations: ["Seeking Alpha 快讯 RSS；个人非商业用途条款见源站"],
  }),
  feed({
    sourceId: "nber-papers",
    name: "NBER Working Papers",
    feedUrl: "https://www.nber.org/rss/new.xml",
    category: "finance",
    limitations: ["美国国家经济研究局最新工作论文公开 RSS"],
  }),
  feed({
    sourceId: "npr-business",
    name: "NPR Business",
    feedUrl: "https://feeds.npr.org/1006/rss.xml",
    category: "finance",
    limitations: ["NPR 商业新闻公开 RSS"],
  }),
  feed({
    sourceId: "guardian-business",
    name: "The Guardian Business",
    feedUrl: "https://www.theguardian.com/uk/business/rss",
    category: "finance",
    limitations: ["卫报商业版块公开 RSS"],
  }),
  feed({
    sourceId: "mckinsey-insights",
    name: "McKinsey Insights",
    feedUrl: "https://www.mckinsey.com/insights/rss",
    category: "finance",
    limitations: ["麦肯锡 Insights 公开 RSS（管理/经济洞察，非行情）"],
  }),
  feed({
    sourceId: "coindesk",
    name: "CoinDesk",
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    category: "finance",
    limitations: ["加密市场新闻公开 RSS；波动大，仅作信息源"],
  }),
  // —— 央行 / 政策 / 监管 ——
  feed({
    sourceId: "fed-press",
    name: "Federal Reserve Press",
    feedUrl: "https://www.federalreserve.gov/feeds/press_all.xml",
    category: "policy",
    limitations: ["美联储新闻稿公开 XML"],
  }),
  feed({
    sourceId: "fed-monetary",
    name: "Federal Reserve · Monetary Policy",
    feedUrl: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    category: "policy",
    limitations: ["美联储货币政策相关新闻稿公开 XML"],
  }),
  feed({
    sourceId: "ecb-press",
    name: "ECB Press",
    feedUrl: "https://www.ecb.europa.eu/rss/press.html",
    category: "policy",
    limitations: ["欧洲央行新闻公开 RSS"],
  }),
  feed({
    sourceId: "ecb-stats",
    name: "ECB Statistical Press",
    feedUrl: "https://www.ecb.europa.eu/rss/statpress.html",
    category: "policy",
    limitations: ["欧洲央行统计新闻公开 RSS"],
  }),
  feed({
    sourceId: "bis-press",
    name: "BIS Press Releases",
    feedUrl: "https://www.bis.org/doclist/all_pressrels.rss",
    category: "policy",
    limitations: ["国际清算银行新闻稿公开 RSS"],
  }),
  feed({
    sourceId: "fsb-press",
    name: "Financial Stability Board",
    feedUrl: "https://www.fsb.org/feed/",
    category: "policy",
    limitations: ["金融稳定理事会（FSB）公开 RSS"],
  }),
  feed({
    sourceId: "sec-press",
    name: "SEC Press Releases",
    feedUrl: "https://www.sec.gov/news/pressreleases.rss",
    category: "policy",
    limitations: ["美国证监会新闻稿公开 RSS"],
  }),
  feed({
    sourceId: "cftc-press",
    name: "CFTC Press",
    feedUrl: "https://www.cftc.gov/RSS/RSSGP/rssgp.xml",
    category: "policy",
    limitations: ["美国商品期货交易委员会新闻公开 RSS"],
  }),
  feed({
    sourceId: "bankofengland",
    name: "Bank of England News",
    feedUrl: "https://www.bankofengland.co.uk/rss/news",
    category: "policy",
    limitations: ["英格兰银行新闻公开 RSS"],
  }),
  feed({
    sourceId: "boj-en",
    name: "Bank of Japan (EN)",
    feedUrl: "https://www.boj.or.jp/en/rss/whatsnew.xml",
    category: "policy",
    limitations: ["日本银行英文更新公开 RSS"],
  }),
  feed({
    sourceId: "bls-latest",
    name: "BLS Latest",
    feedUrl: "https://www.bls.gov/feed/bls_latest.rss",
    category: "policy",
    limitations: ["美国劳工统计局最新发布公开 RSS"],
  }),
  // —— 综合 / 国际 ——
  feed({
    sourceId: "bbc-world",
    name: "BBC World",
    feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "general_news",
    limitations: ["国际新闻公开摘要 RSS"],
  }),
  feed({
    sourceId: "nytimes-tech",
    name: "NYTimes Technology",
    feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    category: "tech_global",
    paywall: "partial",
    limitations: ["标题与摘要公开；全文可能需订阅"],
  }),
  // —— 科学 / 健康 ——
  feed({
    sourceId: "nature-news",
    name: "Nature",
    feedUrl: "https://www.nature.com/nature.rss",
    category: "science",
    paywall: "partial",
    limitations: ["Nature 公开 RSS；全文访问依机构/订阅而定"],
  }),
  feed({
    sourceId: "science-news",
    name: "Science Magazine News",
    feedUrl: "https://www.science.org/rss/news_current.xml",
    category: "science",
    paywall: "partial",
    limitations: ["Science 新闻公开 RSS 摘要"],
  }),
  feed({
    sourceId: "who-news",
    name: "WHO News",
    feedUrl: "https://www.who.int/rss-feeds/news-english.xml",
    category: "science",
    limitations: ["世界卫生组织英文新闻公开 RSS"],
  }),
  feed({
    sourceId: "mit-news",
    name: "MIT News",
    feedUrl: "https://news.mit.edu/rss/feed",
    category: "science",
    limitations: ["MIT 新闻公开 RSS"],
  }),
  feed({
    sourceId: "nasa-breaking",
    name: "NASA Breaking News",
    feedUrl: "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    category: "science",
    limitations: ["NASA 突发/要闻公开 RSS"],
  }),
  feed({
    sourceId: "esa-space-science",
    name: "ESA Space Science",
    feedUrl: "https://www.esa.int/rssfeed/Our_Activities/Space_Science",
    category: "science",
    limitations: ["欧空局空间科学公开 RSS"],
  }),
  feed({
    sourceId: "plos-one",
    name: "PLOS ONE",
    feedUrl: "https://journals.plos.org/plosone/feed/atom",
    format: "atom",
    category: "science",
    limitations: ["PLOS ONE 最新论文 Atom；条目量中等，同步按 SDK 上限截断"],
  }),
  // —— 安全 ——
  feed({
    sourceId: "krebs-security",
    name: "Krebs on Security",
    feedUrl: "https://krebsonsecurity.com/feed/",
    category: "security",
    limitations: ["安全新闻博客公开 RSS"],
  }),
  feed({
    sourceId: "aws-security",
    name: "AWS Security Blog",
    feedUrl: "https://aws.amazon.com/blogs/security/feed/",
    category: "security",
    limitations: ["AWS 安全博客公开 RSS"],
  }),
  feed({
    sourceId: "schneier",
    name: "Schneier on Security",
    feedUrl: "https://www.schneier.com/feed/atom/",
    format: "atom",
    category: "security",
    limitations: ["Bruce Schneier 安全博客公开 Atom"],
  }),
  feed({
    sourceId: "eff-updates",
    name: "EFF Updates",
    feedUrl: "https://www.eff.org/rss/updates.xml",
    category: "security",
    limitations: ["电子前沿基金会更新公开 RSS（隐私/数字权利）"],
  }),
  // —— AI / 研究 ——
  feed({
    sourceId: "openai-blog",
    name: "OpenAI Blog",
    feedUrl: "https://openai.com/blog/rss.xml",
    category: "ai_research",
    limitations: ["OpenAI 博客公开 RSS"],
  }),
  feed({
    sourceId: "deepmind-blog",
    name: "Google DeepMind Blog",
    feedUrl: "https://deepmind.google/blog/rss.xml",
    category: "ai_research",
    limitations: ["DeepMind 博客公开 RSS"],
  }),
  feed({
    sourceId: "arxiv-cs",
    name: "arXiv cs (recent)",
    feedUrl: "https://rss.arxiv.org/rss/cs",
    category: "ai_research",
    limitations: [
      "计算机科学 arXiv 最近论文 RSS；条目量大，同步时会按 SDK 上限截断",
    ],
  }),
  // —— 工程 / 开发 ——
  feed({
    sourceId: "github-blog",
    name: "GitHub Blog",
    feedUrl: "https://github.blog/feed/",
    category: "dev",
    limitations: ["GitHub 官方博客公开 RSS"],
  }),
  feed({
    sourceId: "hnrss-frontpage",
    name: "Hacker News",
    feedUrl: "https://hnrss.org/frontpage",
    category: "dev",
    limitations: ["HN 前页聚合 RSS（第三方 hnrss.org）"],
  }),
  feed({
    sourceId: "cloudflare-blog",
    name: "Cloudflare Blog",
    feedUrl: "https://blog.cloudflare.com/rss/",
    category: "dev",
    limitations: ["Cloudflare 工程博客公开 RSS"],
  }),
  feed({
    sourceId: "stripe-blog",
    name: "Stripe Blog",
    feedUrl: "https://stripe.com/blog/feed.rss",
    category: "dev",
    limitations: ["Stripe 博客公开 RSS"],
  }),
  feed({
    sourceId: "lwn",
    name: "LWN.net",
    feedUrl: "https://lwn.net/headlines/rss",
    category: "dev",
    limitations: ["Linux/开源新闻公开 RSS"],
  }),
  feed({
    sourceId: "ieee-spectrum",
    name: "IEEE Spectrum",
    feedUrl: "https://spectrum.ieee.org/feeds/feed.rss",
    category: "dev",
    limitations: ["IEEE Spectrum 工程/科技公开 RSS"],
  }),
  feed({
    sourceId: "acm-queue",
    name: "ACM Queue",
    feedUrl: "https://queue.acm.org/rss/feeds/queuecontent.xml",
    category: "dev",
    limitations: ["ACM Queue 工程文章公开 RSS"],
  }),
  feed({
    sourceId: "rust-blog",
    name: "Rust Blog",
    feedUrl: "https://blog.rust-lang.org/feed.xml",
    category: "dev",
    limitations: ["Rust 语言官方博客公开 RSS"],
  }),
  feed({
    sourceId: "kubernetes-blog",
    name: "Kubernetes Blog",
    feedUrl: "https://kubernetes.io/feed.xml",
    category: "dev",
    limitations: ["Kubernetes 官方博客公开 RSS"],
  }),
  feed({
    sourceId: "scotusblog",
    name: "SCOTUSblog",
    feedUrl: "https://www.scotusblog.com/feed/",
    category: "general_news",
    limitations: ["美国最高法院报道博客公开 RSS（法律专业）"],
  }),
]);

function feed(input: {
  sourceId: string;
  name: string;
  feedUrl: string;
  category: FeedCategory;
  format?: "rss" | "atom";
  paywall?: "none" | "partial" | "full";
  limitations?: readonly string[];
}): FeedSourceCatalogEntry {
  return Object.freeze({
    sourceId: input.sourceId,
    name: input.name,
    feedUrl: input.feedUrl,
    format: input.format ?? "rss",
    paywall: input.paywall ?? "none",
    enabled: true,
    category: input.category,
    ...(input.limitations
      ? { limitations: Object.freeze([...input.limitations]) }
      : {}),
  });
}

/**
 * Full registerable feed list: SDK enabled sources + Molis Work additions,
 * each with a stable category.
 */
export function listRegisterableFeeds(): readonly FeedSourceCatalogEntry[] {
  const sdk = listEnabledFeedSources().map((source) => {
    const category = SDK_CATEGORY[source.sourceId] ?? "general_news";
    const base: FeedSourceCatalogEntry = {
      sourceId: source.sourceId,
      name: source.name,
      feedUrl: source.feedUrl,
      format: source.format === "atom" ? "atom" : "rss",
      paywall:
        source.paywall === "full"
          ? "full"
          : source.paywall === "partial"
            ? "partial"
            : "none",
      enabled: source.enabled,
      category,
    };
    if (source.sourceId === "36kr") {
      return Object.freeze({
        ...base,
        limitations: KR36_LIMITATIONS,
      });
    }
    return Object.freeze(base);
  });

  const seen = new Set(sdk.map((s) => s.sourceId));
  // Avoid duplicate CNBC top (SDK cnbc) vs cnbc-finance
  const extras = MOLIS_WORK_EXTRA_FEEDS.filter(
    (s) => s.enabled && !seen.has(s.sourceId),
  );
  return Object.freeze([...sdk, ...extras]);
}

export function listFeedUrls(): readonly string[] {
  return Object.freeze(
    listRegisterableFeeds().map((source) => source.feedUrl),
  );
}

export function getFeedById(
  sourceId: string,
): FeedSourceCatalogEntry | undefined {
  return listRegisterableFeeds().find((s) => s.sourceId === sourceId);
}

/** Categories present in the current catalog, stable order. */
export function listFeedCategories(): readonly FeedCategory[] {
  const present = new Set(
    listRegisterableFeeds().map((s) => s.category),
  );
  return Object.freeze(FEED_CATEGORY_ORDER.filter((c) => present.has(c)));
}
