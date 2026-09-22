# Connector app icons

Local copies of third-party app marks, used only to identify the service on Settings → Connectors.

- Most SVGs come from [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons).
- GitHub, X, Vercel, Adobe, Stripe, Canva, monday.com, HubSpot, Intercom, Loom, Slack, Discord, WeChat, Sentry, and Notion are composed as rounded app icons from those marks or the public brand glyph.
- `apps/workbench/src/connector-icons.ts` is generated from these files; ids and CSS classes are prefixed per connector so they do not collide on the settings page.
- Trademarks belong to their owners.
