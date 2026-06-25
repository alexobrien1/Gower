# Create New Tenancy — setup

This adds a staff-only **"Create New Tenancy"** form to your site. You pick the property/room,
enter the contract-holder's details and dates, tick genuine UC factors, and the contract-holder
**signs on screen** (finger / mouse / Apple Pencil). Press **Generate & Send** and the server:

1. fills the whole tenancy pack for that address,
2. stamps the contract-holder's signature — and **your** signature — onto every signing line,
3. emails the PDF to **mail@gowercapitalgroup.com** and the contract-holder, via Resend,
4. saves a record.

Files added for you: `tenancy.js`, `.puppeteerrc.cjs`, `Dockerfile`, and `puppeteer` in
`package.json`. The Gower Living logo (`public/assets/svg/gower-living-primary-navy.svg`) is in place.

---

## 1. Two small edits to `server.js`

**a) Let the signature image through.** Find this line:

```js
app.use(express.json({limit:'200kb'}));
```
and change `200kb` to `2mb`:
```js
app.use(express.json({limit:'2mb'}));
```

**b) Switch the feature on.** Just **above** the last line (`app.listen(PORT, ...)`), add:

```js
require('./tenancy')(app, { requireAuth, data, PUB });
```

That's the only code change. (`requireAuth`, `data` and `PUB` already exist in your server.js.)

## 2. Add your signature (so it's stamped automatically)

Save a **transparent PNG** of your signature as:

```
public/assets/alex-signature.png
```
Dark ink on a transparent background works best. If it's missing, landlord lines just print blank
for wet-ink signing. (This is the clean fix for the signature we couldn't pull out of OneDrive.)

## 3. Email sender (Resend)

You already use Resend for application alerts, so `RESEND_API_KEY` is set. For the pack emails to
reach the **contract-holder** (not just you), verify a domain in Resend (e.g. gowerliving.com) and
set:

```
MAIL_FROM = Gower Living <noreply@gowerliving.com>
```
Until a domain is verified, Resend's test sender only delivers to your own address — fine for testing.
`MAIL_TO` defaults to mail@gowercapitalgroup.com.

**Also set `PUBLIC_URL`** to your live address (e.g. `https://gower-websites.onrender.com`, later
`https://gowerliving.com`). The tenant's emailed signing link is built from it — without it that link
won't work.

## 4. Deploy on Render

Headless Chrome needs its system libraries. Two options:

**Option A — keep it as a Node service (try first).**
Render runs `npm install`, which downloads Chromium into `./.cache/puppeteer` (because of
`.puppeteerrc.cjs`). Redeploy. If the pack generates, you're done. If you see a Chrome
"failed to launch / missing library" error in the logs, use Option B.

**Option B — Docker (most reliable).**
A `Dockerfile` is included with all the Chrome libraries. In Render → your service → **Settings**,
set **Runtime / Environment** to **Docker** and redeploy. Everything else (disk, env vars, domains)
stays the same.

## 5. Use it — two ways to sign

Sign in at `/admin` (staff passcode), then open **`/admin/new-tenancy`**. Choose the property/room
(address, type and council-tax fill in automatically) and enter the contract-holder and terms, ticking
only the UC factors that are genuinely true. Then either:

- **Tenant is with you → "Sign now & send".** They sign in the box (iPad / finger / Apple Pencil) and
  the signed pack emails to you and to them immediately. Print a copy for Jobcentre Plus.
- **Tenant isn't there → "Email tenant to sign".** They receive a branded email with a **Review & sign**
  button. On their own phone or tablet they open the documents, sign, tick "I agree" and press
  **Agree & Sign** — the signed pack then emails to you and to them automatically and the record is
  marked **Signed**. Links are single-use and expire after 14 days.

## 6. Compliance certificates (EPC, Gas, EICR, Guide)

Every pack is now **one complete PDF**: the full occupation contract → the signing documents →
the property's certificates appended at the end. You supply those certificates once per property:

- Visit **`/admin/tenancy-docs`** — it lists every property and the exact folder name to use.
- Drop that property's current **EPC, Gas Safety certificate and EICR** (as PDFs) into
  `public/docs/<property-key>/`.
- Put the shared **"A Home in the Private Rented Sector: A Guide for Tenants in Wales"** PDF into
  `public/docs/_shared/` (it's added to every pack).

If a property has no certs uploaded yet, the pack still sends — just without them. Refresh the files
whenever a certificate is renewed (this is the natural tie-in to your compliance tracker).

---

### Notes
- The pack uses your real brand (Gower Living lockup, Outfit + Plus Jakarta Sans, harbour/cream/gold).
- One PDF per tenancy: occupation contract → signing documents → appended EPC / Gas / EICR / Guide.
- It is a **draft system** — have the occupation contract + pack checked by a solicitor / Rent Smart
  Wales before first live use, as recommended in `CLAUDE.md`.
- Property list and landlord details live at the top of `tenancy.js` if anything needs editing.
