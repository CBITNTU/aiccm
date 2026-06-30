# Per-deployment brand assets

Each deployment profile (`lib/deployment/profiles/*`) points `brand.logoPath` and
`brand.faviconPath` at files under this directory, e.g. `/brand/cn/logo.png`.

The files currently checked in for `cn/` and `th/` are **placeholders** (copies of the
UK logo/favicon) added so those deployments don't ship broken images / a 404 favicon.
Replace them with the real region branding before going live.

- `logo.png` — nav/hero logo
- `favicon.ico` — browser favicon (wired via `app/layout.tsx` metadata)
