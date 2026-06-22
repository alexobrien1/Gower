# Going live: gowerliving.com + gowercapitalgroup.com

Both sites run from this **one** app — it shows the right brand based on the web address visited.
So you deploy once and connect both domains to it.

## What you'll need
- A **GitHub** account (free) — to hold the code.
- A **Render** account — free to open; the small **Starter** plan (~US$7/month) is needed so a
  persistent disk keeps your applications between updates.
- Access to change **DNS** for both domains (wherever they're registered).

## Step 1 — Put the code on GitHub
**No-command-line option:** on github.com create a new repository → "Add file → Upload files" →
drag in everything inside the `Gower-Websites` folder (you don't need `node_modules`) → Commit.

**Terminal option:**
```
cd "Gower-Websites"
git init && git add . && git commit -m "Gower websites"
git branch -M main
git remote add origin https://github.com/<you>/gower-websites.git
git push -u origin main
```

## Step 2 — Create the web service on Render
1. render.com → **New → Web Service** → connect your GitHub repo.
2. Render reads `render.yaml` and fills everything in (Node, build `npm install`, start `npm start`,
   and a 1 GB disk mounted at `/data`).
3. Under **Environment**, set **`ADMIN_PASSWORD`** to a private staff passcode.
   (`SESSION_SECRET` is generated automatically.)
4. Click **Create**. In ~2 minutes you get a URL like `https://gower-websites.onrender.com`.
   Open `/living`, `/capital` and `/admin` to confirm it works.

## Step 3 — Connect your domains
In Render → your service → **Settings → Custom Domains**, add all four:
- `gowerliving.com` and `www.gowerliving.com`
- `gowercapitalgroup.com` and `www.gowercapitalgroup.com`

Render shows the exact DNS records to add. At each domain's DNS (your registrar):
- **Root** (e.g. gowerliving.com): add the A / ALIAS record Render gives you.
- **www**: add a CNAME pointing to the Render target.

HTTPS certificates are issued automatically once DNS verifies (minutes to a few hours).
Result: gowerliving.com shows **Gower Living**, gowercapitalgroup.com shows **Gower Capital Group**,
and both `/apply` forms feed the **same** admin dashboard.

## After go-live checklist
- Confirm the admin passcode is set and private.
- Submit a test application and check it appears in `/admin`.
- The free Render plan sleeps when idle (slow first visit) and has **no** disk — use **Starter** so the
  data persists and the site stays awake.
- Back up the `/data` disk periodically (or move to a managed database as volume grows).
- Add a **privacy notice + retention policy** before promoting the form widely (it collects sensitive data).

## Alternatives
- **Railway.app** — same idea, `Procfile` is included.
- **Your own web host / IT** — fine too, as long as it runs **Node 18+** and provides HTTPS.

Tell me when you're at any step and I'll walk you through it.
