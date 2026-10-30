#!/usr/bin/env node
/**
 * Render the NSDC social card.
 *
 *   node scripts/og-image.cjs
 *
 * Reads scripts/og-image.html, inlines the kit fonts and the brand mask as
 * data: URIs, loads the page in Chromium at exactly 1200 × 630 @1x, waits for
 * the webfonts, verifies the platform fonts actually used, and writes
 * public/og-default.png.
 *
 * Playwright is already a dev dependency (used by the e2e suite), so no extra
 * install is needed. This script only touches public/og-default.png.
 */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(__dirname, "og-image.html");
const OUT_PATH = path.join(ROOT, "public", "og-default.png");
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 400 * 1024;

/** Local asset -> data: URI, so the render cannot race file:// fetches. */
function inlineAssets(html) {
  const assets = [
    ["../public/fonts/bespoke-serif-latin.woff2", "font/woff2"],
    ["../public/fonts/bespoke-serif-italic-latin.woff2", "font/woff2"],
    ["../public/fonts/switzer-latin.woff2", "font/woff2"],
    ["../public/fonts/switzer-medium-latin.woff2", "font/woff2"],
    ["../public/fonts/switzer-semibold-latin.woff2", "font/woff2"],
    ["../public/fonts/geist-mono-latin.woff2", "font/woff2"],
    ["../public/brand/nsdc-symbol.png", "image/png"],
  ];

  return assets.reduce((out, [relative, mime]) => {
    const file = path.join(__dirname, relative);
    const uri = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
    return out.split(relative).join(uri);
  }, html);
}

async function platformFonts(client, rootNodeId, selector) {
  const { nodeId } = await client.send("DOM.querySelector", {
    nodeId: rootNodeId,
    selector,
  });
  if (!nodeId) throw new Error(`Missing element for ${selector}`);
  const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
  return fonts.map(({ familyName, glyphCount, isCustomFont, postScriptName }) => ({
    familyName,
    glyphCount,
    isCustomFont,
    postScriptName,
  }));
}

async function main() {
  const html = inlineAssets(fs.readFileSync(HTML_PATH, "utf8"));

  const browser = await chromium.launch({
    headless: true,
    args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    const page = await context.newPage();

    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const report = await page.evaluate(() => {
      const rect = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: +r.x.toFixed(2),
          y: +r.y.toFixed(2),
          width: +r.width.toFixed(2),
          height: +r.height.toFixed(2),
          right: +r.right.toFixed(2),
          bottom: +r.bottom.toFixed(2),
        };
      };
      const style = (selector) => {
        const el = document.querySelector(selector);
        return el
          ? {
              fontFamily: getComputedStyle(el).fontFamily,
              fontSize: getComputedStyle(el).fontSize,
            }
          : null;
      };
      return {
        fontsStatus: document.fonts.status,
        loadedFaces: [...document.fonts].map((face) => ({
          family: face.family,
          style: face.style,
          weight: face.weight,
          status: face.status,
        })),
        checks: {
          bespoke: document.fonts.check('400 100px "Bespoke Serif"'),
          bespokeItalic: document.fonts.check('italic 400 100px "Bespoke Serif"'),
          switzer: document.fonts.check('400 20px "Switzer"'),
          switzerMedium: document.fonts.check('500 20px "Switzer"'),
          geistMono: document.fonts.check('400 20px "Geist Mono"'),
        },
        styles: {
          wordmark: style("[data-wordmark]"),
          name: style("[data-name]"),
          statement: style("[data-statement]"),
          coords: style("[data-coords]"),
          place: style("[data-place]"),
        },
        boxes: {
          card: rect("[data-card]"),
          wordmark: rect("[data-wordmark]"),
          name: rect("[data-name]"),
          statement: rect("[data-statement]"),
          place: rect("[data-place]"),
          coords: rect("[data-coords]"),
          mark: rect(".mark"),
          top: rect(".top"),
        },
        viewport: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        },
      };
    });

    // Definitive check: ask Chromium which platform font rendered the glyphs.
    const client = await context.newCDPSession(page);
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const { root } = await client.send("DOM.getDocument");
    const used = {
      wordmark: await platformFonts(client, root.nodeId, "[data-wordmark]"),
      name: await platformFonts(client, root.nodeId, "[data-name]"),
      statement: await platformFonts(client, root.nodeId, "[data-statement]"),
      coords: await platformFonts(client, root.nodeId, "[data-coords]"),
      place: await platformFonts(client, root.nodeId, "[data-place]"),
    };

    // CDP reports webfont family names as "false" in this Chromium build, so the
    // definitive signals are isCustomFont (a webfont, not a system fallback),
    // glyphCount, and the element's computed family.
    const expected = {
      wordmark: /Bespoke/i,
      name: /Bespoke/i,
      statement: /Switzer/i,
      coords: /Geist/i,
      place: /Switzer/i,
    };
    for (const [key, pattern] of Object.entries(expected)) {
      const fonts = used[key].filter((font) => font.glyphCount > 0);
      const computed = report.styles[key]?.fontFamily ?? "";
      if (
        !fonts.length ||
        !fonts.every((font) => font.isCustomFont) ||
        !pattern.test(computed)
      ) {
        throw new Error(
          `${key}: expected ${pattern} webfont, got ${JSON.stringify({ fonts, computed })}`,
        );
      }
    }

    if (report.fontsStatus !== "loaded") {
      throw new Error(`document.fonts.status = ${report.fontsStatus}`);
    }
    const missing = Object.entries(report.checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    if (missing.length) throw new Error(`Fonts not available: ${missing.join(", ")}`);

    const { viewport, boxes } = report;
    if (viewport.scrollWidth !== WIDTH || viewport.scrollHeight !== HEIGHT) {
      throw new Error(
        `Page overflows: ${viewport.scrollWidth}×${viewport.scrollHeight}`,
      );
    }
    const safe = 40;
    for (const [key, box] of Object.entries(boxes)) {
      if (key === "card") continue;
      if (!box) throw new Error(`Missing box: ${key}`);
      if (box.x < safe || box.y < safe || box.right > WIDTH - safe || box.bottom > HEIGHT - safe) {
        throw new Error(`Text near the edge: ${key} = ${JSON.stringify(box)}`);
      }
    }

    await page.screenshot({
      path: OUT_PATH,
      type: "png",
      fullPage: false,
      animations: "disabled",
    });

    const png = fs.readFileSync(OUT_PATH);
    const pngWidth = png.readUInt32BE(16);
    const pngHeight = png.readUInt32BE(20);
    if (pngWidth !== WIDTH || pngHeight !== HEIGHT) {
      throw new Error(`PNG is ${pngWidth}×${pngHeight}, expected ${WIDTH}×${HEIGHT}`);
    }

    const bytes = png.length;
    if (bytes > MAX_BYTES) {
      throw new Error(
        `public/og-default.png is ${(bytes / 1024).toFixed(1)} KB (limit ${MAX_BYTES / 1024} KB)`,
      );
    }

    console.log("public/og-default.png");
    console.log(`  size:     ${pngWidth} × ${pngHeight} @1x (PNG header)`);
    console.log(`  bytes:    ${bytes} (${(bytes / 1024).toFixed(1)} KB)`);
    console.log(`  fonts:    ${report.fontsStatus}`);
    console.log("  rendered:");
    for (const [key, fonts] of Object.entries(used)) {
      const glyphs = fonts.reduce((sum, font) => sum + font.glyphCount, 0);
      console.log(
        `    ${key.padEnd(10)} ${report.styles[key].fontFamily} — custom webfont, ${glyphs} glyphs`,
      );
    }
    console.log(
      `  margins:  top ${boxes.top.y}, bottom ${HEIGHT - boxes.place.bottom}, left ${boxes.mark.x}, right ${WIDTH - boxes.coords.right}`,
    );
    console.log(`  overflow: none (${viewport.scrollWidth}×${viewport.scrollHeight})`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
