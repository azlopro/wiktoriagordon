# Security audit plan — Wiktoria Gordon Beauty

This is the agreed plan for a security review of the entire website and editing
system. It is not a completed audit or a claim that the production system has
passed. The real audit starts after the final domain, GitHub repository and OAuth
Worker are configured.

## Scope

The audit covers the complete publishing chain:

1. The public Danish and English Hugo site, generated HTML, JavaScript, CSS,
   images, structured data, redirects, error pages and external links.
2. `/admin/`, including the pinned Sveltia CMS bundle, `config.yml`, custom visual
   previews, media processing and every editable field.
3. GitHub authentication and authorization, the OAuth app, the
   `sveltia-cms-auth` Cloudflare Worker, token handling and logout.
4. The GitHub repository: owners, collaborators, 2FA, recovery, branch rules,
   signed commits, audit history, secret scanning, backup and rollback.
5. Cloudflare Pages, Workers, DNS, TLS, deployment settings, environment secrets,
   preview deployments, caching and response headers.
6. Any enabled booking/payment integration, including Cal.com, Stripe, embeds,
   webhooks and the handling of contact, allergy or health-related answers.
7. Privacy and GDPR exposure: third-party requests, logs, analytics, consent,
   retention, deletion and processor/account ownership.

Out of scope unless separately approved: denial-of-service testing, credential
brute force, destructive production uploads, social engineering, testing with real
customer data, or scanning infrastructure not owned by the client.

## Access and prerequisites

Before testing, record:

- Final production and preview domains.
- Final GitHub repository owner and the people who should retain access.
- Read-only access to relevant GitHub and Cloudflare settings/audit logs.
- The deployed OAuth Worker URL and GitHub OAuth app callback URL.
- A dedicated low-privilege editor test account with 2FA.
- Whether booking, Stripe, analytics, forms or other third parties are enabled.
- A recent repository backup and a known-good production deployment to roll back to.
- Written permission for the exact domains/accounts and a low-risk test window.

The current repository still contains demo domain values and an OAuth Worker
placeholder. Authentication and live headers cannot be signed off until those are
replaced and deployed.

## Method and test sequence

### 1. Architecture, inventory and data flow

- Draw the trust path: browser → Pages → `/admin/` → OAuth Worker → GitHub → Pages
  build, plus optional booking/payment providers.
- Inventory every script, font, image, API host, iframe and outbound request in the
  public site and admin.
- Identify where credentials, OAuth codes/tokens, CMS content, uploads, customer
  answers and deployment logs are stored and who can access each location.
- Confirm all production accounts and billing/recovery methods belong to the client,
  with the developer receiving only delegated access.

### 2. Repository and supply-chain review

- Search the entire Git history and current tree for passwords, OAuth secrets,
  tokens, `.env` files, private URLs and personal/customer data; use an approved
  secret scanner as a second pass.
- Verify the Hugo version, pinned Sveltia bundle version and OAuth Worker source and
  record their checksums/provenance. Review published security advisories before
  each update.
- Rebuild from a clean checkout and compare the generated site; produce a small
  component/dependency inventory and confirm no unexpected remote runtime code.
- Review `.gitignore`, Cloudflare build variables and local developer files so
  secrets cannot be committed accidentally.
- Define an update cadence and a tested rollback procedure for Hugo, Sveltia and the
  authenticator rather than silently following latest releases.

### 3. GitHub identity and authorization

- Require 2FA for every owner/editor, store recovery codes safely and verify a second
  recovery method. No shared accounts or shared passwords.
- Give each marketer their own GitHub identity and only the minimum repository role;
  test onboarding and immediate offboarding.
- Review OAuth scopes, callback URLs, app ownership and secret storage. Confirm the
  Worker re-checks current repository authorization and does not expose codes,
  secrets or tokens in responses/logs.
- Prefer OAuth-only login for non-technical editors; explicitly evaluate disabling
  PAT login (`auth_methods: [oauth]`). If PAT login remains, document browser storage,
  revocation and device-loss procedures.
- Evaluate a protected/editorial workflow: required build checks, no force-push or
  branch deletion, signed commits and approval for high-risk changes. Preserve a
  simple client workflow where the chosen GitHub plan permits it.
- Verify that every CMS save is attributable, recoverable and cannot bypass the
  required deployment checks.

### 4. OAuth Worker and session tests

- Test OAuth `state`, exact redirect URI matching, replay resistance, error paths,
  logout, token revocation, expired/removed-user behavior and concurrent sessions.
- Confirm HTTPS only, least-privilege CORS, safe redirects, no wildcard origins and
  no secrets in the Worker source or plaintext variables.
- Inspect browser storage and network traffic for token leakage through URLs,
  referrers, logs, screenshots, third-party requests or preview frames.
- Test rate limits and abuse handling with harmless requests only. Review Worker
  logs and define alerting for unusual authorization failures.

### 5. CMS, preview and content-input tests

- Attempt stored XSS and markup injection in every text, URL, list, SEO, review,
  FAQ, caption and business field. Verify output escaping in Hugo, JSON-LD, meta
  attributes and the custom React previews.
- Test unsafe URL schemes, broken/malformed YAML, extreme lengths, Unicode, control
  characters and language-tab desynchronization.
- Upload renamed executables, polyglot files, SVG with script/external references,
  incorrect MIME types, oversized images, decompression bombs and hostile filenames
  using small safe fixtures. Confirm type, extension, size and image decoding are
  all validated before publication.
- Confirm uploaded files cannot escape `static/img`, overwrite protected assets or
  become active HTML/JavaScript. Decide whether client SVG upload should be disabled.
- Verify preview iframes are sandboxed, custom previews never render raw HTML, links
  use safe targets, and a preview failure cannot prevent CMS initialization.
- Test failed saves, merge conflicts, double-click saves, stale browser tabs,
  interrupted uploads and restoration from Git history.

### 6. Public site and browser controls

- Crawl both languages and check generated HTML, canonical/hreflang links, 404s,
  forms, embeds, JSON-LD and outbound links for injection or unexpected disclosure.
- Inspect production TLS and all response headers with direct requests. Test a
  Content Security Policy in report-only mode first, then enforce a policy tailored
  separately for the public site and `/admin/`.
- Evaluate HSTS, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, cross-origin policies, cache rules and `X-Robots-Tag`.
  `/admin/` should be non-indexed, non-framable and avoid inappropriate caching.
- Confirm Pages preview domains are not indexed and the production custom domain is
  the sole canonical host. Test redirects between HTTP/HTTPS and alternate hosts.
- Confirm no source maps, drafts, raw source photos, repository metadata, config
  secrets or admin test fixtures are publicly exposed.

Cloudflare Pages can apply static-response policies through `static/_headers`; any
future Pages Function or Worker must set its own response headers because Pages
rules do not cover function responses.

### 7. Deployment, monitoring and recovery

- Confirm only the intended repository/branch deploys to production and preview
  branches cannot obtain production secrets unnecessarily.
- Require a clean Hugo build and automated checks before production publication.
  Test that a failed build leaves the previous deployment live.
- Rehearse rollback of one CMS content change, one asset upload, one Sveltia update
  and one OAuth Worker deployment.
- Enable useful GitHub/Cloudflare security notifications and document who receives
  them, triages them and revokes access when an editor leaves.
- Establish incident steps: contain, revoke tokens/secrets, preserve evidence,
  restore, notify affected parties if required, and complete a retest.

### 8. Booking, payment and privacy review

- Repeat vendor/account permission checks after Cal.com or Stripe is connected.
  Verify webhook signatures, replay handling, test/live separation, secret rotation,
  price/deposit integrity and cancellation/refund authorization.
- Minimize booking questions. Treat allergy/health answers as sensitive data; define
  purpose, access, retention and deletion before collecting them.
- Verify privacy notices match actual network requests, vendors and logs. Reassess
  consent requirements before adding analytics, pixels, chat widgets or marketing
  embeds.

## Findings and acceptance

Each finding must include evidence, affected component, reproducible steps,
likelihood, impact, severity, recommended fix, owner and due date. Use four levels:

- **Critical:** credible account/repository takeover, secret exposure or payment/data
  compromise. Block launch or disable the affected feature immediately.
- **High:** practical authentication bypass, stored XSS for editors/visitors, unsafe
  upload execution or unauthorized publishing. Fix before launch.
- **Medium:** meaningful hardening or privacy gap with mitigating controls. Fix on an
  agreed short deadline.
- **Low:** defense-in-depth, maintenance or documentation issue. Track it rather than
  silently accepting it.

The audit is complete only when critical/high findings are fixed and retested,
accepted medium/low risks have a named owner/date, rollback is demonstrated, and a
short final report records both passed controls and remaining limitations.

## Recommended timing

1. **Pre-launch:** static review, repository history/secret scan, upload/XSS tests and
   security-header draft.
2. **After final OAuth/domain setup:** full authenticated CMS, Worker, TLS/header and
   role/offboarding tests.
3. **Before booking/payment launch:** integration and privacy review using test mode.
4. **Ongoing:** quarterly access review; dependency/advisory review at least monthly;
   full retest annually and after any major CMS, authentication or payment change.

## Primary references

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [Sveltia CMS security guidance](https://sveltiacms.app/en/docs/security)
- [Sveltia CMS GitHub authentication](https://sveltiacms.app/en/docs/backends/github)
- [GitHub OAuth app security practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Cloudflare Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
