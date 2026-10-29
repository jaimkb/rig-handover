---
name: pages-preview
description: Put one HTML preview of a rig page on Cloudflare Pages, upload over it later, and take it down, with wrangler. Use for a plan's "Preview for review" and "Clean up" steps (ADR 0003).
---

# pages-preview

One HTML file on a public HTTPS link, uploaded over later and taken down at the end (ADR 0003).
Cloudflare Pages is free and needs no payment method. Runs with `npx wrangler`, no install.

Ask the human before the first upload, before every upload over it, and before any delete: say
what, why, where, who can see it and how to undo it. Every step has `--help`: read it, don't guess
flags.

## Before

1. The human owns the Cloudflare account. Check with `npx wrangler whoami`; if not signed in,
   `npx wrangler login` opens their browser and waits a few minutes, so start it only when they're
   at the browser.
2. Work in a folder **outside the repo** (no previews in the repo, ADR 0003) with no
   `wrangler.json`, `wrangler.jsonc` or `wrangler.toml` in it or above it: wrangler acts on the
   nearest one. Put the page alone in its own subfolder (`site/index.html`): wrangler writes a
   `.wrangler` cache next to where it runs, and `pages deploy` uploads the whole folder.

## Save the page

Run rig (`pnpm start`, `.env` holds `LANE_MARKER`) and save with a command, not a browser:

```sh
curl -f -o site/index.html http://localhost:8787/digest/<night>
```

Check the banner holds the marker you expect, and no `<script`. `.env` is read at start: restart rig
after changing it, and on Windows check port 8787 is free first (stopping `pnpm` can leave `node`
listening).

## Put it up

Once per project. wrangler 4 sends a plain `pages project create` to Workers and fails with
"Missing entry-point"; `--force` makes a plain Pages project. Only this command needs it:

```sh
npx wrangler pages project create <project> --production-branch main --force
```

Each upload, the first and every one over it:

```sh
npx wrangler pages deploy site --project-name <project> --branch main --commit-dirty=true
```

The link to send is `https://<project>.pages.dev/`. Each upload also gets its own link,
`https://<id>.<project>.pages.dev/`, which stays up after the next upload.

Before sending the link, fetch it the way the reviewer will (no sign-in) and compare:

```sh
curl -s -o /tmp/check.html -w '%{http_code}\n' https://<project>.pages.dev/
cmp /tmp/check.html site/index.html && echo same
```

## Upload over it (clean-up)

Save the page again with `LANE_MARKER=` empty (banner: "no marker set"), deploy it as above, then
delete every older upload, or its own link keeps the marker public:

```sh
npx wrangler pages deployment list --project-name <project> --json
npx wrangler pages deployment delete <old-id> --project-name <project> --force
```

The delete prompt answers "no" outside an interactive terminal; `--force` skips it. List again:
only the clean upload should be left. Fetch the main link and every upload link and check none
shows the marker.

## Take it down

```sh
npx wrangler pages project delete <project> --yes
```
