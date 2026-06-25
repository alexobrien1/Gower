# Go live — Create New Tenancy (step by step)

Everything is built and the two `server.js` edits are already done. This is the order to get it
running on Render. Allow ~30 minutes the first time.

---

## Step 0 — Add your signature (1 min)
Save a **transparent PNG** of your signature as `public/assets/alex-signature.png`
(dark ink, transparent background). It is stamped on every landlord signing line. If you skip it,
landlord lines just print blank.

## Step 1 — Get the code to GitHub
You're updating the existing `gower-websites` repo with the new files
(`tenancy.js`, `Dockerfile`, `.puppeteerrc.cjs`, updated `package.json`, `public/docs/…`, `public/assets/alex-signature.png`).

**No-command-line way:** github.com → your `gower-websites` repo → **Add file → Upload files** →
drag in the changed files (or the whole `Gower-Websites` folder, minus `node_modules`) → **Commit**.

**Terminal way:**
```
cd "…/Gower-Websites"
git add -A && git commit -m "Create New Tenancy + signing + certs" && git push
```

## Step 2 — Create the service on Render (Blueprint — easiest)
`render.yaml` is now set to **Docker**, so Render configures everything (Docker build, the 1 GB disk,
and the env-var prompts) straight from the file. The `Dockerfile` installs all of Chrome's system
libraries, so the PDF step launches reliably.

- Render → **New → Blueprint** → connect your `gower-websites` repo → Render reads `render.yaml`,
  shows the service and asks for the secret values (next step). Click **Apply**. First build takes a
  few minutes.
- **If a Node service already exists from the first deploy:** either delete it and create the
  Blueprint service, or in the existing service set **Settings → Runtime = Docker** and redeploy.
  Your `/data` disk and any domains can be re-attached.

## Step 3 — Set the environment variables (Render → your service → Environment)
| Key | Value | Why |
|---|---|---|
| `ADMIN_PASSWORD` | a private staff passcode | sign-in to `/admin` |
| `RESEND_API_KEY` | your Resend key | sends the emails (already used by the app) |
| `MAIL_FROM` | `Gower Living <noreply@gowerliving.com>` | sender; use a **Resend-verified** domain |
| `MAIL_TO` | `mail@gowercapitalgroup.com` | your copy (this is the default if unset) |
| `PUBLIC_URL` | e.g. `https://gower-websites.onrender.com` (later your real domain) | **builds the tenant's signing link — required for the email-to-sign flow** |
| `SESSION_SECRET` | (Render generates) | login security |

## Step 4 — Deploy
Render auto-deploys on each GitHub commit. Otherwise click **Manual Deploy → Deploy latest commit**.
Watch the log finish ("Live"). First Docker build takes a few minutes.

## Step 5 — Upload each property's certificates
Open **`/admin/tenancy-docs`** (after signing in). It lists every property and the exact folder name.
For each let property, put its current **EPC, Gas Safety certificate and EICR** (PDFs) into
`public/docs/<property-key>/`, and the shared **Guide for Tenants in Wales** into `public/docs/_shared/`.
Commit/push them (same as Step 1). They're appended to that property's packs automatically.

## Step 6 — Test it end to end
1. Open `https://<your-site>/admin`, sign in with `ADMIN_PASSWORD`.
2. Go to **`/admin/new-tenancy`**. Create a test tenancy using **your own email** as the contract-holder.
3. **Sign now & send** (sign in the box) → check the combined PDF arrives in your inbox.
4. Do it again with **Email tenant to sign** → open the link on your phone, sign, press **Agree & Sign**
   → check the signed pack arrives.
5. Confirm the certificates are appended for a property you've uploaded.

When all four work, you're live. Keep your solicitor / Rent Smart Wales review on file before first
real contract-holder, per `CLAUDE.md`.

---
**Need a hand?** Tell me where it stops and I'll talk you through that exact step (or I can switch
`render.yaml` to Docker for you so Render is pre-configured).
