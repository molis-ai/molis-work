# Connector brand marks

Local SVG copies identify their services; trademarks belong to their owners. Checked 2026-09-26.

- The base collection is [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons/tree/main/svg). GitHub, X, Vercel, Adobe, Stripe, Slack, Discord, WeChat, Sentry, Notion and Figma use its actual brand artwork rather than hand-drawn substitutes.
- Canva: [official Connect design guidelines and downloadable brand assets](https://www.canva.dev/docs/connect/guidelines/design/).
- monday.com: brand symbol from the [official website](https://monday.com/).
- HubSpot: Sprocket symbol from the [official website](https://www.hubspot.com/).
- Intercom: product symbol from the [official website](https://www.intercom.com/).
- Loom: pinned-tab brand asset from the [official website](https://www.loom.com/).
- TypeSafe: brand asset from the [official website](https://typesafe.ai/).
- Lark shares the Feishu symbol. Model API, Images API and generic MCP use the application's existing Lucide symbols because they do not represent one provider.

`connector-icons.ts` embeds these local SVGs. Settings renders each mark in an isolated SVG image, preserving internal gradient and style IDs without collisions. A 24px contained image sits centered in a 40px light surface with an 8px safe area in both themes. Brand aspect ratios remain intact.
