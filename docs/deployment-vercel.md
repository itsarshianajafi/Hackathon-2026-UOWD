# Deploy the merged main branch to Vercel

The web app is self-contained under `web/`. Python is not required on Vercel;
dashboards use the committed JSON snapshots. Deploy the merged `main` branch,
not `handover` or `news` unless those branches are separately reviewed and merged.

## 1. Publish the deployment changes

Review and commit the deployment changes, then push them to GitHub. No hosting
account, project, database or paid resource is created by these files alone.

## 2. Import the repository

In Vercel, choose **Add New → Project**, then import
`itsarshianajafi/Hackathon-2026-UOWD` (or your authorized fork).

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework | Next.js |
| Root Directory | **`web`** |
| Node.js | **24.x** (also pinned in `package.json`) |
| Install command | `npm ci` |
| Build command | From `web/vercel.json`: lint, tests, production build |
| Output directory | Leave the Next.js default |

Do not configure a static export: chat and booking APIs require server functions.
The agent function has a 60-second limit and aborts model work after 55 seconds.

## 3. Connect a Neon Postgres database

Use the **Vercel Marketplace → Neon** integration and connect its database to the
project. Ensure it supplies **`DATABASE_URL`**. Review the provider's pricing and
limits before creating a resource.

In the Neon SQL editor, execute [`web/scripts/viewings.sql`](../web/scripts/viewings.sql).
It creates the booking table and a unique listing/slot constraint so simultaneous
requests cannot double-book a viewing. Run this once for every database/branch
used by the app. Do not run schema creation in the build command.

**Use a separate Neon database or branch for Preview deployments.** Never connect
untrusted pull request previews to production bookings or production API keys.
Vercel deployments deliberately refuse to fall back to ephemeral local files.

## 4. Set environment variables

Set these under **Project Settings → Environment Variables** before deploying:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only OpenAI key for chat; dashboards still render without it |
| `ESTARO_MODEL` | Optional; defaults to `gpt-4.1-mini` |
| `DATABASE_URL` | Neon connection string; required for hosted bookings |

Never prefix these with `NEXT_PUBLIC_`, commit their values, or paste keys into chat.
Use appropriately scoped, separate secrets for Production and Preview, then
redeploy after changing them. Set an OpenAI project budget/usage limit.

The website opens publicly without a username or password. `/api/health` does
not reveal secrets. Chat and booking endpoints also have no login gate; review
the limitations below before configuring live API keys or storing personal data.

## 5. Deploy and verify

Deploy from Vercel after the changes are pushed. Open the resulting HTTPS URL and:

1. Confirm `/api/health` returns `{"status":"ok"}`.
2. Confirm `/` and `/dashboard` open without a login or `WWW-Authenticate` challenge.
3. Try the buyer and investor dashboards and a chat request.
4. Book a **test** viewing; verify it appears in Viewings and in Neon.
5. Redeploy, then confirm the test viewing remains. Trying the same listing/slot
   again must not create a duplicate. Remove test data through the SQL editor.

Builds/tests can run without live keys or a database. Database integration and
OpenAI calls must still be checked against the actual deployed services.

## Local development

Use Node 24, run `npm ci` in `web/`, copy `.env.example` to `.env.local`, then run
`npm run dev`. With no `DATABASE_URL`, bookings use `.data/viewings.json` locally.
To test Neon locally, set a **development** database URL and initialize its table.
Existing local bookings are not automatically migrated to Neon.

## Scope and limitations

This is a public hackathon demo, not a multi-user production service. There is
no authentication: if a database is connected, everyone sees the same viewing
list. Do not enter real customer information. Use HTTPS only when hosted.

Before enabling paid model calls on a public site, add distributed rate limiting
and abuse controls; input limits alone do not prevent unwanted API spend. Before
serving real customers, add individual authentication, per-user booking
authorization, a privacy/retention policy, and database backups. Bookings remain
synthetic demo listings, and market/news snapshots do not refresh on deployment.
