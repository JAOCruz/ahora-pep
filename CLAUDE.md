# AhoraPep (ahorapep.com)
Static site in `site/` (index.html, styles.css, main.js catalog/cart, dna3d.js particle DNA, vial3d.js 3D vial). `_original/` = snapshot of the lost Next.js site (inventory.json is private — gitignored going forward).
- Use `premium-3d-web` for visual work, `arcova-infra` for deploy/repo facts.
- Catalog: `/api/inventory` proxied (site/netlify.toml) to the OLD Next.js deploy permalink `6a957d131ca32346024bc569--ahorapep.netlify.app` — don't delete that deploy. Never display/ship wholesale_price, suggested_retail, margin_pct, qty.
- Compliance: research-use-only; keep the legal disclaimer verbatim; no medical/therapeutic/dosing claims.
- TODO: WhatsApp number (`site/main.js` const WHATSAPP + contact line); backend rebuild that strips sensitive fields; repo visibility (public).
- Deploy (user runs it): `cd site && netlify deploy --prod --dir . --site 6a565f4d-088a-43ee-8361-cc9a09ca2f18`. Preview: draft deploy to `b48db168-8dd1-466c-986b-7cc8a1e1e3fa`.
