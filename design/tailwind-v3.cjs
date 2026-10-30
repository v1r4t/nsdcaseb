/**
 * Tailwind 3 preset. Only needed if the host is still on Tailwind 3.
 *
 *   // tailwind.config.cjs
 *   module.exports = {
 *     presets: [require("./design/tailwind-v3.cjs")],
 *     content: ["./src/**", "./design/**"],
 *   };
 *
 * Tailwind 4 hosts import tailwind-v4.css instead.
 */
const plugin = require("tailwindcss/plugin");

module.exports = {
  theme: {
    extend: {
      colors: {
        paper: "#f2eee3",
        ink: "#111110",
        faint: "#67635a",
        seal: "#b33c1b",
        quiet: "#5f5b53",
        "footer-muted": "#98968f",
        "footer-accent": "#dd7048",
      },
      fontFamily: {
        display: ['"Bespoke Serif"', '"Iowan Old Style"', "Georgia", "serif"],
        serif: ['"Bespoke Serif"', '"Iowan Old Style"', "Georgia", "serif"],
        sans: ["Switzer", "system-ui", "-apple-system", '"Segoe UI"', "Arial", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        ink: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ".mono": {
          fontFamily: "var(--font-mono)",
          fontSize: "0.6875rem",
          lineHeight: "1.45",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        },
        ".mono-sm": {
          fontFamily: "var(--font-mono)",
          fontSize: "0.8125rem",
          lineHeight: "1.55",
          letterSpacing: "0.01em",
        },
        ".serif": { fontFamily: "var(--font-serif)" },
        ".sans": { fontFamily: "var(--font-sans)" },
        ".hairline": { borderColor: "var(--hairline)" },
        ".rule-top": { borderTop: "1px solid var(--hairline)" },
        ".wrap": {
          width: "100%",
          maxWidth: "1440px",
          marginInline: "auto",
          paddingInline: "var(--gutter)",
        },
        ".statement": {
          fontFamily: "var(--font-serif)",
          fontWeight: "400",
          fontSize: "clamp(2.75rem, 7.2vw, 6.5rem)",
          lineHeight: "0.98",
          letterSpacing: "-0.02em",
        },
        ".statement-sm": {
          fontFamily: "var(--font-serif)",
          fontWeight: "400",
          fontSize: "clamp(1.75rem, 3.4vw, 2.75rem)",
          lineHeight: "1.05",
          letterSpacing: "-0.01em",
        },
      });
    }),
  ],
};
