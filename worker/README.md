# Comments API (Cloudflare Worker + D1)

Backend for reader annotations on david-bloom.com essays. Spec:
`../specs/annotations.md`. Frontend: `../src/scripts/annotations.js`.

## Local development

Easiest: from the **repo root**, `npm install` once, then

```sh
npm run dev:full
```

boots site (http://localhost:4321) and API (http://localhost:8787) together,
installing worker deps and applying the D1 schema automatically.

Manually, the API alone:

```sh
cd worker
npm install
npx wrangler d1 execute comments --local --file schema.sql   # once
npx wrangler dev                                             # http://localhost:8787
```

`.dev.vars` supplies local-only secrets; the author passphrase for local play
is `local-dev-passphrase`. The site's `annotations.js` automatically targets
`http://localhost:8787` when the page is served from localhost, so
`npm run dev` (or `npx astro preview`) in the repo root + `npx wrangler dev`
here is the whole local stack. No `RESEND_API_KEY` locally means email sends
are skipped.

## Production deployment (needs David's Cloudflare account)

One-time setup, in order:

1. `npx wrangler login`
2. `npx wrangler d1 create comments` — paste the returned `database_id` into
   `wrangler.jsonc` (replacing `REPLACE_WITH_D1_DATABASE_ID`).
3. `npx wrangler d1 execute comments --remote --file schema.sql`
4. Secrets:
   ```sh
   npx wrangler secret put AUTHOR_PASSPHRASE   # choose the author-mode passphrase
   npx wrangler secret put IP_HASH_KEY         # any long random string
   npx wrangler secret put RESEND_API_KEY      # from resend.com (optional at first)
   ```
5. `npx wrangler deploy` — the `custom_domain` route in `wrangler.jsonc`
   creates `api.david-bloom.com` automatically (Cloudflare-proxied, unlike the
   site's DNS-only records).
6. Resend (email notification on new comments): create an account, verify
   `david-bloom.com` (it gives DNS records to add in the same Cloudflare
   zone), then set `RESEND_API_KEY`. Until then the Worker silently skips
   notifications — comments still work.

Redeploys after code changes: just `npx wrangler deploy`.

## Moderation

Visit any essay with `#author` in the URL, enter the passphrase once per
device. Cards then show Delete / Delete thread / Hide thread controls, and
the composer gains a "comment as David (Author)" checkbox.
