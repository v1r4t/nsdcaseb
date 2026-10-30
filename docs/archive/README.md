# Archived dark-editorial landing mockups

These files are **historical reference only**. They are the retired
dark-editorial landing concepts that preceded the current ink-on-paper design
system.

- `landing-dark.html` — the last dark-system landing preview (formerly
  `landing.html` at the repo root).
- `index_v2.html`, `index_v2_min.html`, `index_v3.html`, `indexp.html` —
  earlier exploratory landing mocks kept at the repo root.

They are **not part of the built site**. Nothing in `src/`, `site/`, `public/`,
`worker/` or the root Vite config imports, links to or serves them.

The move into `docs/archive/` was a pure file move: the markup is unchanged, so
their relative references to `public/fonts/…` and other root-level assets no
longer resolve. The broken font and asset paths are intentional; opening a file
directly shows the layout with fallback fonts and missing images. Repair the
paths locally if you need a faithful preview — do not copy these files back into
the build.

The current design language lives in [`design/design.md`](../../design/design.md)
and [`design/README.md`](../../design/README.md).
