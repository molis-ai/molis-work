# Molis OAuth on Cloudflare Workers

This Worker owns confidential OAuth application credentials. It reuses the Host's provider definitions and exchanges authorization codes and refresh tokens; it does not read user content or persist tokens in a cloud database. Official MCP dynamic-registration connections continue to authorize directly with their provider.

Origin: `https://auth.molis.ai`. The initial Worker is deployed in the configured Molis account; HTTPS health and provider discovery are verified; real provider grants remain pending. Deploy only in this account with control of this domain. The current configuration intentionally disables `workers.dev` and request observability. Do not log request/response bodies, authorization headers, callback query strings, or secrets.

## Secrets and deployment

Use Worker Secrets, never committed files, for:

- `ENVELOPE_KEY`: 32 cryptographically random bytes encoded as base64url. The production key is already installed. Keep it stable; do not regenerate it on redeploy. Rotation invalidates pending authorizations and all wrapped refresh tokens. Use a different key in every environment.
- `OAUTH_APPS`: JSON object keyed by service ID. Each entry contains `clientId`, `clientSecret` where required, and optional provider `settings`. Example shape: `{ "asana": { "clientId": "...", "clientSecret": "..." } }`. Include only configured/approved apps. Google services may use the same Molis app registration but have separate entries and scopes.
- `OAUTH_APP_<SERVICE_ID>`: preferred for adding/updating a single service without replacing the existing map (uppercase, hyphens replaced with underscores; for example `OAUTH_APP_GITHUB`). Value is one complete JSON app entry, `{ "clientId": "...", "clientSecret": "..." }`. This overrides that service in `OAUTH_APPS`, including when invalid; fields are never merged with old credentials. Leave existing Google entries and `ENVELOPE_KEY` untouched when adding other providers.

Register `https://auth.molis.ai/callback` as the allowed redirect URL with each provider. Complete the provider's brand/domain/scope/distribution review; having a client ID alone does not establish approval. Do not use placeholder privacy-policy URLs.

From the repository root:

```sh
pnpm dlx wrangler deploy --dry-run --config apps/local-host/cloudflare/wrangler.jsonc
pnpm dlx wrangler secret put OAUTH_APP_GITHUB --config apps/local-host/cloudflare/wrangler.jsonc
pnpm dlx wrangler deploy --config apps/local-host/cloudflare/wrangler.jsonc
```

Enter secrets through the secure CLI prompt or an approved secret delivery mechanism. Never paste secrets into chat or shell command arguments. Cloudflare account authentication and domain ownership must be available before deployment. The configuration includes a rate limiter (60 requests per minute, per path and hashed connecting IP, per Cloudflare location); confirm its namespace is unused in the destination account. Shared networks may hit the limit and receive a retryable 429. The OAuth app is public, so a shared key embedded in desktop binaries is not an access-control substitute.

After deployment, verify `/health` and `/providers`, then set the Host's `MOLIS_WORK_CONNECTOR_BROKER_ORIGIN=https://auth.molis.ai` and `MOLIS_WORK_CONNECTOR_BROKER_SERVICES` to the comma-separated IDs actually configured in the Worker. These are nonsecret settings. Do not enable services before their real login and callback checks pass. Existing custom apps and account-specific reauthorization remain supported.

## Protocol

- Host creates its own state/verifier and posts `/start` with a loopback return URI and SHA-256 challenge. Worker selects its own provider/scopes/settings, creates a separate upstream verifier, and returns the official login URL. Input cannot choose a token endpoint or scopes.
- Provider returns to `/callback`. Worker validates encrypted, expiring state and forwards an encrypted two-minute code ticket to the fixed Host callback path. No user access token appears in the redirect URL.
- Host posts `/token` with the ticket and its verifier. Worker validates service, application, purpose, expiry, and proof before exchanging the provider code. The provider enforces one-time code consumption; a transport failure after consumption requires reauthorization.
- Refresh tokens are returned as encrypted, service-bound envelopes. Host holds these as bearer credentials in its existing SecretStore and submits them for refresh. The Worker never accepts raw arbitrary refresh tokens. Refresh envelopes expire after one year and renew on successful refresh. Provider revocation/expiry still takes precedence.
- Cancellation returns `access_denied` to the validated local callback. Invalid states receive a generic error without redirect; upstream error bodies and secrets never pass through.

Provider configuration requirements: [configuration-readiness.md](../../../specs/connector-experience/configuration-readiness.md). The September 27 protocol audit fixes are not yet deployed; deploy reviewed code before enabling affected providers.

Tests: `node scripts/run-tests.mjs tests/connector-provider-contracts.test.ts tests/connector-oauth-broker.test.ts tests/connector-api-oauth.test.ts`. Local tests verify protocol behavior using provider fixtures; deployment and actual provider grants remain separate acceptance checks.
