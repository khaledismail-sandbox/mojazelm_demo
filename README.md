# Mojaz Demo App (Amplitude)

A static, multi-page web clone of Elm's **Mojaz** vehicle-history-report app, laid out
in a phone frame for desktop demos. Fires a precise Amplitude taxonomy through real
interactions and deterministically reproduces a scripted friction story for Session Replay.

## Run it

- Any static server: `python3 -m http.server 8000` in this folder, then open `http://localhost:8000/`
- Or open `index.html` directly (`file://` — relative paths are safe)
- **GitHub Pages ready as-is**: push this folder to a repo → Settings → Pages → deploy from branch. No build step.

## Screens (each a real URL path)

`/` home · `/auth/` · `/search/` · `/vehicle/` · `/order/` (Persona B disclaimer) ·
`/payment/` (Persona A only) · `/report/` · `/packages/` · `/sample-report/` ·
`/account/` · `/preview-checkout/` (standalone "after" exhibit — type the URL manually; event-silent)

## Personas (deterministic — decided ONLY by the auth path)

| Path | Persona | Behavior |
|---|---|---|
| **Log in** | A — Returning Report Buyer | No disclaimer, straight to payment, purchase always succeeds |
| **Create account** | B — First-Time Report Buyer | Always hits the pay-blind disclaimer, CTA stalls ~6s, only exits are "View sample report" / Back → `Report Order Abandoned`. Never reaches `/payment/` |

User ID format: `<name>_<demoNumber>_<yyyymmdd>` (shown live on the auth form and on `/account/`).
Logout on `/account/` runs `amplitude.reset()` and clears persona state.
Promo code that works on `/payment/`: **EID10** (10% off).

## Demo script

- **Persona A**: Log in → search `349811247` → vehicle summary → Get Mojaz Report →
  Standard Report → pay → report opens. Events: App Opened → Logged In → VIN Search
  Submitted → Vehicle Summary Viewed → Report Order Started → Payment Started →
  Report Purchased (revenue).
- **Persona B**: Create account → same search → Get Mojaz Report → disclaimer interstitial
  (`Report Coverage Disclaimer Viewed`) → CTA stalls → View sample report / Back →
  `Report Order Abandoned`. 100% reproducible.

## Demo settings

`/account/` → "Demo settings" (collapsed): switch event `platform` iOS/Android,
pick the KSA city/region sent on events, and see the local fired-events log.
