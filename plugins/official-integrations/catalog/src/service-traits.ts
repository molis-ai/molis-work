import type { CatalogConnectorSpec } from "./types.js";

export { webSearchSpec } from "./web-search.js";

/**
 * What each service stands in for and what in a project points at it (§13.7; automation suggestions §7), as this plugin declares them.
 * Categories use the words skills write in `connector_categories`; hints are matched against a project's Git remotes, files and
 * dependencies. A service with nothing to say is left out.
 */
export const SERVICE_TRAITS: Readonly<Record<string, Pick<CatalogConnectorSpec, "categories" | "project_hints">>> = {
  "google-calendar": { categories: ["calendar"] },
  outlook: { categories: ["email", "calendar"] },
  "google-drive": { categories: ["cloud-storage"] },
  onedrive: { categories: ["cloud-storage"] },
  sharepoint: { categories: ["cloud-storage", "knowledge-base"] },
  dropbox: { categories: ["cloud-storage"], project_hints: { dependencies: ["dropbox"] } },
  box: { categories: ["cloud-storage"] },
  notion: { categories: ["knowledge-base"], project_hints: { dependencies: ["@notionhq/client", "notion-client"] } },
  slack: { categories: ["chat"], project_hints: { dependencies: ["@slack/*", "slack-sdk", "slack-bolt"] } },
  teams: { categories: ["chat"] },
  discord: { categories: ["chat"], project_hints: { dependencies: ["discord.js", "discord.py"] } },
  feishu: { categories: ["chat", "knowledge-base"], project_hints: { dependencies: ["@larksuiteoapi/node-sdk", "lark-oapi"] } },
  lark: { categories: ["chat", "knowledge-base"] },
  wechat: { categories: ["chat"] },
  zoom: { categories: ["meetings"] },
  gitlab: { categories: ["source-control"], project_hints: { git_hosts: ["gitlab.com"], files: [".gitlab-ci.yml"] } },
  bitbucket: { categories: ["source-control"], project_hints: { git_hosts: ["bitbucket.org"], files: ["bitbucket-pipelines.yml"] } },
  vercel: { categories: ["deployment"], project_hints: { files: ["vercel.json", ".vercel/"] } },
  cloudflare: { categories: ["deployment"], project_hints: { files: ["wrangler.toml", "wrangler.jsonc", "wrangler.json"], dependencies: ["wrangler"] } },
  huggingface: { categories: ["ml-models"], project_hints: { dependencies: ["transformers", "huggingface-hub", "@huggingface/*"] } },
  sentry: { categories: ["error-monitoring"], project_hints: { files: ["sentry.properties", ".sentryclirc"], dependencies: ["@sentry/*", "sentry-sdk"] } },
  supabase: { categories: ["database"], project_hints: { files: ["supabase/"], dependencies: ["@supabase/supabase-js", "supabase"] } },
  linear: { categories: ["project-tracker"], project_hints: { dependencies: ["@linear/sdk"] } },
  jira: { categories: ["project-tracker"], project_hints: { dependencies: ["jira-client", "jira.js"] } },
  confluence: { categories: ["knowledge-base"] },
  asana: { categories: ["project-tracker"], project_hints: { dependencies: ["asana"] } },
  clickup: { categories: ["project-tracker"] },
  monday: { categories: ["project-tracker"] },
  airtable: { categories: ["database"], project_hints: { dependencies: ["airtable", "pyairtable"] } },
  loom: { categories: ["meetings"] },
  figma: { categories: ["design"], project_hints: { dependencies: ["@figma/*"] } },
  canva: { categories: ["design"], project_hints: { dependencies: ["@canva/*"] } },
  adobe: { categories: ["design"] },
  salesforce: { categories: ["crm"], project_hints: { files: ["sfdx-project.json"], dependencies: ["jsforce", "simple-salesforce"] } },
  hubspot: { categories: ["crm"], project_hints: { dependencies: ["@hubspot/*", "hubspot-api-client"] } },
  intercom: { categories: ["customer-support"], project_hints: { dependencies: ["intercom-client", "@intercom/*"] } },
  stripe: { categories: ["payments"], project_hints: { dependencies: ["stripe", "@stripe/*"] } },
  x: { categories: ["social"] },
  linkedin: { categories: ["social"] },
};
