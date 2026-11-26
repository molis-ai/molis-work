# Where Molis Work connects to

[中文](NETWORK.md)

Molis Work is a local-first workbench: your goals, notes and files live on your own computer. This page lists the network requests Molis Work makes **itself**: which features go online, to which site, what is sent, and what limits apply. There are 16 numbered classes (class 0 is the model; classes 1–16 are not model calls; the former class 6, the Casebook reference client, was deleted with Casebook, and class 7 was retired with the old Alchemist; the other numbers stay).

Commands you run in the terminal panel, commands the host runs after you approve them (such as `git push`), external agents you start yourself, and external links you click are your own actions and are not covered here.

> For maintainers: any new outbound request (`fetch`, `https.request`, a networked command in a child process) needs a class on this page first, or an entry in an existing class, with host, trigger, what is sent and the limits. Initially checked against `main` on 2026-10-09; class 0 was re-checked on 2026-10-10 against `06a64c98c`; classes 14–16 (account avatars, central Auth V2 service, and personal cloud sync via Cloudflare Worker/R2) were added on 2026-11-26 against `2ca43ef58f`.

## At a glance

| Class | Feature | Where to | What is sent |
| --- | --- | --- | --- |
| 0 | Model, image and judgement services | The service addresses you configured in Settings › Model settings and Service connections | The material for this request and your key (only to the service you configured); saving model settings adds one short connectivity check |
| 1 | Service connections and tool installation | The service you connect and the tool's official release sites and package sources | Authorization and read requests go to the service. Preparing or installing a tool requests package names, versions and releases for your computer. |
| 2 | Feed sources (RSS, YouTube) | Catalog feeds and the public RSS addresses you enter | Ordinary read requests |
| 3 | Web search (AnySearch) | `api.anysearch.com` | The search words and the page addresses to extract |
| 4 | Pages and links you name | The addresses you give | Ordinary read requests, without your credentials |
| 5 | Plugins made in the plugin studio | The sites the plugin declared and you approved | The plugin's own requests |
| 7 | (no longer used) the former Alchemist market pulse | — | Removed with the old Alchemist; the number is kept and not reused |
| 8 | On this machine | Loopback addresses | Never leaves your computer |
| 9 | Plugin studio build check | `registry.npmjs.org` | **Dependency package names and versions** |
| 10 | Public DNS fallback for host names | `dns.google`, `dns.alidns.com` | **Site names** (only where a proxy hands out placeholder addresses) |
| 11 | On-device transcription model download | A model host (usually Hugging Face) | The model download request (about 626 MB, only if you explicitly allow it) |
| 12 | Side-panel browser | The pages you or the assistant open | Ordinary browser visits |
| 13 | Feed research-library source | `github.com` | `git fetch` |
| 14 | Account avatars | `*.googleusercontent.com`, `avatars.githubusercontent.com` | Browser image requests when showing linked account avatars; no Auth token and no referrer |
| 15 | Central account login & session management (Auth V2) | Your environment's configured Auth service origin (HTTPS in test/production, e.g. `https://auth.test.molis.ai`; numeric loopback in local dev) | Sign-in/verification/OAuth callback exchange, session read/refresh, logout revocation, profile/tenant/entitlement queries (tokens stay inside the Host, never exposed to plugins or the browser) |
| 16 | Personal cloud sync (Cloudflare Worker / R2) | Only when a sync origin (`MOLIS_WORK_SYNC_ORIGIN`, e.g. `https://work.test.molis.ai`) is explicitly configured and you sign in and opt this device in | Incremental changes for collections you explicitly select, SHA-256-verified private attachment chunks (within the shared 100 MB account quota), and quota/retained-history/trash queries; carries only your Auth access token, never model keys or third-party connection credentials |

Only classes 9 and 10 send a **name** (a package name, a site name) to a third party that has nothing to do with the feature itself, and what they send contains none of your content. These three cases are described below.

## The three cases that tell a third party a name

1. **Plugin studio build check (class 9).** If a generated plugin declares runtime dependencies, the "packaging" step of the build check sends the dependencies' **package names and versions** to the npm registry (`registry.npmjs.org`) to download them. With no declared dependencies nothing goes online. The studio says this in its interface.
2. **Proxy placeholder addresses (class 10, 10a).** If your computer runs proxy software that answers every host name lookup with a placeholder address first (`198.18.0.0` through `198.19.255.255`), Molis Work sends the **site name** it needs to reach to Google (`dns.google`) and Alibaba Cloud (`dns.alidns.com`) public DNS services to ask for the real address. The site names concerned are the model, image and judgement services you configured, and AnySearch (`api.anysearch.com`, used by the Feed web search). This only happens when a proxy environment variable is set (one of `https_proxy`, `HTTPS_PROXY`, `all_proxy`, `ALL_PROXY`) and the system answer is a placeholder address; an ordinary network never does it.
3. **Jelly page import behind placeholder addresses (class 10, 10b).** When every address the system returns is a placeholder (the proxy variables are not consulted), Jelly sends the **site name of the page being read** to Google's public DNS service. This is closer to "which sites you read", so it is listed on its own.

All three exist so that the product still works in unusual environments. Only a name is sent, never credentials or content, and the proxy software can already see those names.

## Class by class

### 0. Model, image and judgement services

- **When:** you use the assistant, a plugin's AI feature, image generation, Functions, and so on; and when you save a provider in Settings › Model settings and that save changes how Molis Work reaches the provider (a new key or connection, the address, the API format, the thinking or cache settings, or a model added or turned back on), Molis Work first sends **one connectivity check** to that provider's address: a very short test request carrying the key you typed or the key of the connection you chose. A save that does not change how the provider is reached (a rename, one model switched off) sends no check. The "test this model" button beside each model sends the same kind of test request.
- **Where to:** the service address you configured in Settings › Model settings or Service connections. Molis Work does not pick a model vendor for you, and no vendor's address is contacted by default; the code carries vendor addresses in three places, and the first two contact nothing before you save: (1) the one-click templates in Settings › Model settings (`MODEL_PROVIDER_TEMPLATES` in the code): choosing a template only pre-fills the form with the address, the API format and a model name that stays put, never a key; it holds eight vendors' official addresses: `api.anthropic.com`, `api.openai.com/v1`, `api.deepseek.com`, `api.minimax.cn/anthropic`, `dashscope.aliyuncs.com/compatible-mode/v1`, `api.moonshot.cn/v1`, `open.bigmodel.cn/api/paas/v4` and `openrouter.ai/api/v1`; (2) the image connection form pre-fills the API base URL of the OpenAI or Gemini preset when you choose it (it is used only once you save it); (3) a development-only environment path that does not go through a save: only when a developer sets `MINIMAX_API_KEY` and no model provider is configured, `https://api.minimax.cn/anthropic` is used as the text model address and text model requests go straight to it; ordinary use never reaches it. The judgement service (Functions) uses `api.typesafe.ai`.
- **Limits:** every model request goes through the Home's one Prologue inference port. The port denies all outbound traffic by default and Molis Work allows exactly three: models, external MCP services (the assistant and Coding calling the MCP services you connected), and loopback. Authorization and configuration are checked again before sending; a cancelled or revoked call is not sent. Neither the connectivity check on save nor the "test this model" button uses that resident port: they run the same Prologue code with the same three allowances, from a short-lived instance that is discarded afterwards, and have no per-call authorization re-check. The check goes only to the address you entered; if it fails nothing is saved, and the message never contains the key.

### 1. Service connections

- **When:** you connect a third-party account in Settings › Service connections; later when a connector syncs or reads a document, or the assistant, Feed or the artifact library uses the connection. When you start a new project and pick a Gmail source in the project setup, Molis Work reads your recent mail directly with that connection as starting material (only the last 7 or 30 days, spam and deleted excluded, at most 20 messages, no attachments).
- **Where to:** each service's own host (the catalog has dozens). An optional OAuth broker (`auth.molis.ai`, a Cloudflare Worker, used only when configured, not running on your computer).
- **Limits:** the access token comes from the connection, never from a plugin's input; redirects are not followed; each request has a time limit.
- **Command-line tools and MCP child processes:** some connections log in through a command on your computer (`gh`, `hf`, `sentry`, `lark-cli`, ...), and that command is what goes online. The Feishu and Lark MCP connector starts a child process on your computer: it runs the version-pinned `@larksuiteoapi/lark-mcp` installed with Molis Work (no more `npx` download at run time), and the child receives only the App ID, App Secret, token, the proxy and certificate variables you already set, and basic system variables such as `HOME` and `PATH`. It does not receive your model keys or other environment variables. Each start runs it in a newly created empty working directory that only your account can write to and that is deleted afterwards: the package reads a `.env` file from its working directory, and a proxy variable written there would change where requests carrying the App Secret go, so it never runs in a shared directory such as `/tmp`.

- **Preparing an installation.** When preparing a plan for a native client or PowerShell, Molis Work looks up official release information and checksums. Native clients come from GitHub, `gitlab.com` or `acli.atlassian.com`. GitHub can also serve releases and metadata from `api.github.com`, `raw.githubusercontent.com`, `release-assets.githubusercontent.com` and `objects.githubusercontent.com`.
- **Installing.** If a suitable runtime is missing, the installer downloads Node.js from `nodejs.org` and uv or PowerShell from GitHub. When uv installs the selected Python version, it uses Python Standalone Builds on GitHub. Molis Work checks each redirect for releases it downloads directly. For a native client archive it verifies the SHA-256 against the installation plan. [uv's Python download source](https://docs.astral.sh/uv/reference/settings/#python-install-mirror)
- **What package sources receive.** npm and Python tools use the indexes at `registry.npmjs.org` or `pypi.org` and the distribution addresses they return by default. A plan can specify a credential-free HTTPS registry or a local registry. The Microsoft Graph authentication module comes from PowerShell Gallery (PSGallery). Microsoft lists `cdn.oneget.org` and `cdn.powershellgallery.com` for package distribution. Package managers look up package names, versions and dependencies and download files for the selected version, operating system and architecture. Installation uses a separate tool directory and environment. Project content, model keys and service tokens stay on your computer during download. [PowerShell Gallery's network access documentation](https://learn.microsoft.com/en-us/powershell/gallery/getting-started#network-access-to-the-powershell-gallery)

### 2. Feed sources (RSS, YouTube)

- **When:** Feed pulls a source, manually or on a schedule.
- **Where to:** catalog RSS/Atom feeds, the public RSS addresses you enter, and public YouTube channel feeds (`www.youtube.com`).
- **Limits:** allow-listed transport; a public address you enter is resolved first and local or internal addresses are refused; conditional requests (etag, last-modified).

### 3. Web search (AnySearch)

- **When:** a Feed web-search source is pulled, manually or on a schedule.
- **Where to:** only `api.anysearch.com:443/mcp`, anonymous, without credentials.
- **Limits:** there is **one implementation** of the outbound path to AnySearch (`apps/local-host/src/anysearch-transport.ts`): a fixed host; the resolved address must be public and is pinned, the certificate is verified and the connected peer address is checked; redirects are not followed; requests up to 64 KiB, responses up to 1 MiB. See class 10 for placeholder-address environments; Feed web search works there.
- **What is sent:** the search words and the page addresses to extract.

### 4. Pages and links you name

- **When:** material import reads a web page; Jelly reads a source you give.
- **Where to:** the http(s) address you give. Jelly's Bilibili adapter also contacts the fixed `api.bilibili.com` and downloads the subtitle and audio addresses it returns; the Xiaoyuzhou and Xiaohongshu adapters download the audio, video or image addresses the page lists (public https only).
- **Limits:** material import is an explicit fetch you asked for: no credentials, 12 seconds, 4 MiB, at most 5 redirects, and **local and internal addresses are not blocked** (local pages included). Jelly accepts public addresses only, re-checks each hop, pins the resolved address, sends only public headers and no cookies; pages and APIs up to 4 million bytes, audio, video and images up to 25 MiB each.

### 5. Plugins made in the plugin studio

- **When:** you try or install a plugin made in the studio and it goes online while running.
- **Where to:** the hosts that plugin declared and you approved.
- **Limits:** https only, default port, no credentials in the address; every address actually connected to must be public (the placeholder address range is accepted like an ordinary network, an established development-machine decision); redirects are not followed; 15 seconds, 1 MiB response, 256 KiB request. Checks and acceptance run offline, and manual trials are read-only (GET, HEAD).

### 7. (No longer used)

Class 7 was the Alchemist market pulse, removed with the old Alchemist in batch 44B; the number is kept and not given to another class.

### 8. On this machine

Molis Work's own components talk over loopback (`127.0.0.1`): the action gateway, the installer's health check of the local service, and the debugging ports of the side-panel browser and the studio preview browser. It never leaves your computer.

### 9. Plugin studio build check

- **When:** the studio's build check, in the "packaging" step, goes online **only when the generated project declares runtime dependencies**.
- **Where to:** `https://registry.npmjs.org`, package metadata and archives (archive addresses must be same-origin).
- **What is sent:** only package names and versions (the request path).
- **Limits:** exact versions or `^x.y.z` / `~x.y.z` only; 20 seconds; redirects are not followed; metadata and archive up to 8 MiB each; at most 64 packages, depth 12; the SHA-512 integrity must match; no package script runs and archives are unpacked in a sandbox with networking denied.

### 10. Public DNS fallback for host names

See cases 2 and 3 above.

- **10a (model, image, judgement services and AnySearch):** only when a proxy variable is set and the system lookup returns a placeholder address, A and AAAA records are asked from `https://dns.google/resolve` and `https://dns.alidns.com/resolve`; the resolver that answered last time goes first and the other is tried only if the transport fails. Only the site name and record type are sent; 8 seconds; answers are not cached; every returned address still has to pass the public-address check.
- **10b (Jelly page reading):** when the system lookup returns only placeholder addresses, A records are asked from `https://dns.google/resolve` (Google only). Only the site name of the page being read is sent; 6 seconds; the answer must be a fully public IPv4; cached for 60 seconds; the returned address still has to pass the public-address check.

### 11. On-device transcription model download

When Jelly imports audio or video and you explicitly allow the download, the on-device speech-to-text component downloads a model of about 626 MB (repository id `argmaxinc/whisperkit-coreml`, usually from Hugging Face). Without your permission the component refuses to go online.

### 12. Side-panel browser

When you type an address in the side-panel browser, or the assistant works on the same page, the Chrome-family browser Molis Work starts (headless, with its own user-data directory) visits any http(s) site; input that is not an address goes to `https://www.bing.com/search`. The service's own loopback addresses cannot be loaded; each look and action of the assistant is judged by Prologue, and sites follow your allow and block decisions.

### 13. Feed research-library source

When the Feed "research library" source syncs, Molis Work starts a `git` child process that shallow-fetches the `main` branch of `https://github.com/<owner>/<repo>.git` (`git fetch --depth=1`) into Molis Work's own cache directory, without touching your checkouts and without ever prompting; 120 seconds, 16 MiB of output; it reads only `sources.json`, `catalog.json` and each package's `manifest.json`, `research.json` and `report.md`.

### 14. Account avatars

- **When:** while signed in, the browser loads linked third-party account avatars displayed in the account menu or account settings.
- **Where to:** Google and GitHub avatar hosts (`*.googleusercontent.com`, `avatars.githubusercontent.com`).
- **What is sent and limits:** ordinary browser image requests with `no-referrer` and no Auth tokens or Molis Work credentials. Never triggered when signed out or when no linked avatar is shown.

### 15. Central account login and session management (Auth V2)

- **When:** when you sign in (password, email/SMS verification code, or Google/GitHub OAuth), restore or refresh a session, read or update your profile and login methods, check tenants/subscriptions/entitlements, or sign out and revoke sessions.
- **Where to:** the fixed central Auth origin configured for your environment (`horizontal/account`; HTTPS in test/production such as `https://auth.test.molis.ai`, or configured numeric loopback such as `http://127.0.0.1:8787` in local development). Neither the browser, plugins, nor business input can choose or override the Auth URL.
- **What is sent and limits:** only operations defined in the pinned Auth OpenAPI contract (authentication transactions, session refresh/revocation, profile/entitlement queries). Redirects, malformed schemas, and oversized bodies are rejected; mutating requests are never auto-retried. Central access and refresh tokens remain inside the Host secret store and in-memory session manager and are never exposed to the browser, plugins, or models. When unconfigured or signed out, no requests are sent and local spaces remain completely offline.

### 16. Personal cloud sync (Cloudflare Worker / R2)

- **When:** only after you sign into a personal account, enter your personal space, and explicitly opt this device into automatic sync or click "Sync now" / inspect cloud retained history or trash (disabled by default; a new device asks before any background transfer).
- **Where to:** the canonical HTTPS sync service origin explicitly configured on the trusted Host (`modules/sync-replication` and `apps/sync-worker` via `MOLIS_WORK_SYNC_ORIGIN`, e.g. `https://work.test.molis.ai`, or explicit local dev `http://127.0.0.1:8788`). The sync service runs on Cloudflare Workers + D1 + private R2; browser pages, plugins, and login parameters cannot choose the destination.
- **What is sent and limits:** only incremental changes for the collections you explicitly select in Settings › Sync plus owner-declared private attachment chunks (fixed 4 MiB chunks with per-part and full SHA-256 verification under a shared 100 MB account quota). Local-space data, arbitrary local folders, model API keys, third-party connection credentials, and external AI session transcripts are never uploaded. Requests carry only your Auth Bearer token (or short-lived signed read proof) and never follow redirects; signing out, switching accounts, or returning to a local space immediately cancels in-flight sync. With no sync origin configured or device sync off, zero requests are sent.

## To go online less

- Do not connect services, add feed sources, or use web search, and the matching classes do not happen.
- Staying in a local space without signing in avoids classes 14, 15, and 16; even when signed in, leaving device cloud sync disabled (the default) prevents class 16.
- Model requests go only to the service you configured, never to another vendor.
- Class 10 happens only where a proxy hands out placeholder addresses; without a proxy environment variable 10a is never triggered.
