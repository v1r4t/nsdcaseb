# Third-party notices

This site bundles the following third-party software. Their licences apply to
those components, not to the NSDC code or content.

## Runtime dependencies

| Package | Version | Licence |
| --- | --- | --- |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-router-dom | 7.18.4 | MIT |
| three | 0.186.1 | MIT |
| gsap | 3.15.0 | GreenSock Standard "no charge" licence — see below |
| lucide-react | 1.49.0 | ISC |

### GSAP

GSAP is **not** MIT-licensed. It is distributed under the GreenSock Standard
"no charge" licence, which permits free use (including commercial use) but does
not permit redistributing or reselling GSAP as a competing product. See
<https://gsap.com/standard-license>. Do not relicense GSAP under MIT.

## Build and test tooling

| Package | Version | Licence |
| --- | --- | --- |
| vite | 8.3.1 | MIT |
| @vitejs/plugin-react | 6.1.1 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| tailwindcss | 3.4.19 | MIT |
| postcss | 8.5.28 | MIT |
| autoprefixer | 10.6.1 | MIT |
| vitest | 5.0.5 | MIT |
| jsdom | 29.1.1 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| @axe-core/playwright | 4.14.0 | MPL-2.0 |
| @cloudflare/workers-types | 5.20261003.1 | MIT OR Apache-2.0 |
| @types/node | 26.6.5 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @types/three | 0.186.0 | MIT |
| supabase (CLI) | 2.121.0 | MIT |

Full licence texts are shipped inside each package under `node_modules/<name>/`.
When redistributing a production bundle, retain this file alongside it.

## Fonts

Self-hosted in `public/fonts/`:

| Font | Copyright | Licence |
| --- | --- | --- |
| Space Grotesk | 2018 The Space Grotesk Project Authors | SIL Open Font License 1.1 |
| Geist Mono | 2024 Vercel, Inc. | SIL Open Font License 1.1 |

The required licence text and copyright notices are in `public/fonts/OFL.txt`.

## Services

Cloudflare Workers/D1/KV, Supabase Storage and Resend are used under their
respective terms of service. No third-party analytics or tracking scripts are
bundled.
