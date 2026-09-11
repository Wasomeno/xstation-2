import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

test("responsive cascade stays last and desktop content inventory is preserved", async () => {
  const html = await read("index.html");
  const systemIndex = html.indexOf("videos/gateway-hero/nadi-system.css");
  const responsiveIndex = html.indexOf("videos/gateway-hero/responsive.css");
  assert.ok(systemIndex > -1 && responsiveIndex > systemIndex);
  assert.equal((html.match(/<section\b/g) || []).length, 13);
  // One CTA per product, the two hero buttons, and the contact button, which now
  // uses the same control as the products instead of a bare text link.
  assert.equal((html.match(/class="[^"]*station-cta\b/g) || []).length, 11);
  assert.equal((html.match(/media\/clients\//g) || []).length, 7);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml"[^>]+nadi-favicon\.svg/);
  // Primary and footer navigation are part of the page again.
  assert.match(html, /id="site-links"/);
  assert.match(html, /class="site-footer-links"/);

  const products = ["bikinkonten", "lubna", "crm-ai-agent", "hireassess", "arkiv", "codev", "coframe", "cofinance"];
  let previous = -1;
  for (const id of products) {
    const index = html.indexOf(`id="${id}"`);
    assert.ok(index > previous, `${id} remains present and in desktop order`);
    previous = index;
  }
});

test("favicon keeps the NADI wordmark on a white background", async () => {
  const favicon = await read("videos/gateway-hero/media/brand/nadi-favicon.svg");
  assert.match(favicon, /<rect[^>]+fill="#fff"/);
  assert.match(favicon, /viewBox="-360 -1080 4206 1440"/);
  assert.match(favicon, /fill="#1B6B47"/);
});

test("system controls use native button semantics without changing their order", async () => {
  const html = await read("index.html");
  const buttons = [...html.matchAll(/<button[^>]+data-system-state="([^"]+)"[^>]*>/g)];
  assert.deepEqual(buttons.map((match) => match[1]), ["ecosystem", "build", "scale", "govern", "secure", "optimize", "managed"]);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 6);
});

test("compact layout has explicit tablet phone voice and touch policies", async () => {
  const [css, work, cluster] = await Promise.all([
    read("videos/gateway-hero/responsive.css"),
    read("videos/gateway-hero/work.js"),
    read("videos/gateway-hero/cluster.js"),
  ]);
  assert.match(css, /--voice-clearance:/);
  assert.match(css, /min-width:\s*48rem[^}]*max-width:\s*63\.999rem/s);
  assert.match(css, /max-width:\s*47\.999rem/);
  assert.match(css, /\.sys-col\s*{\s*display:\s*contents;/);
  assert.match(css, /\.sys-stage\s*{[^}]*max-height:\s*42dvh;/s);
  assert.match(css, /orientation:\s*landscape[\s\S]*?min-height:\s*44px;/);
  assert.match(work, /smoothScrollMedia[^\n]+hover:\s*hover[^\n]+pointer:\s*fine/);
  const snapSource = work.slice(work.indexOf("function bindHeroSystemSnap"), work.indexOf("function bindProductsTitle"));
  assert.match(snapSource, /touchmove/);
  assert.doesNotMatch(snapSource, /min-width:\s*64rem/);
  assert.match(work, /connection\?\.saveData/);
  // The surface is measured for clearance, but a phone hides it outright, so the
  // zero-sized rect a display:none element reports has to be treated as absent.
  assert.match(work, /voiceSurface[\s\S]{0,160}getBoundingClientRect\(\)/);
  assert.match(work, /voiceRect\?\.height \? voiceRect\.top/);
  assert.match(cluster, /const phone = W < 768;/);
  assert.match(cluster, /const tablet = W >= 768 && W < 1024;/);
  assert.match(cluster, /const labelY = Math\.min/);
});

test("compact layout preserves desktop-visible content and shared touch snapping", async () => {
  const [css, voice, work, cluster, systemMotion] = await Promise.all([
    read("videos/gateway-hero/responsive.css"),
    read("videos/gateway-hero/voice.css"),
    read("videos/gateway-hero/work.js"),
    read("videos/gateway-hero/cluster.js"),
    read("videos/gateway-hero/nadi-system.js"),
  ]);

  const parity = css.slice(css.indexOf("Preservation parity and compact geometry"));
  assert.match(parity, /#brand \.brand-tag\s*{[^}]*display:\s*block/s);
  assert.match(parity, /\.sys-cap\s*{[^}]*display:\s*block/s);
  assert.match(parity, /\.inquiry-code\s*{[^}]*display:\s*block/s);
  assert.match(parity, /\.support-scan\s*{[^}]*display:\s*inline/s);
  assert.match(parity, /\.project-cta-icon\s*{[^}]*display:\s*inline-block/s);
  assert.match(parity, /\.sys-stage\s*{[^}]*position:\s*relative[^}]*overflow:\s*visible/s);
  assert.match(parity, /\.space-stage\s*{[^}]*aspect-ratio:\s*16\s*\/\s*10/s);
  assert.match(parity, /orientation:\s*landscape[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.02fr\)/);

  assert.match(voice, /max-width:\s*47\.999rem[\s\S]*left:\s*50%[\s\S]*right:\s*auto[\s\S]*transform:\s*translateX\(-50%\)/);
  assert.match(voice, /max-width:\s*47\.999rem[\s\S]*\.voice-copy\s*{[^}]*text-align:\s*center/s);
  assert.doesNotMatch(voice, /max-width:\s*47\.999rem[\s\S]*#voice-surface\s*{[^}]*display:\s*none/s);

  assert.match(work, /cleanupHeroSystemSnap\s*=\s*bindHeroSystemSnap\(\)/);
  assert.doesNotMatch(work, /responsiveMotion\.add\([^\n]*bindHeroSystemSnap/);
  assert.match(work, /function setCurrent\(sectionId\)/);
  assert.match(work, /setAttribute\("aria-current",\s*"location"\)/);
  const brandVisibility = work.slice(
    work.indexOf("function bindBrandVisibility"),
    work.indexOf("function bindInquiryEntry"),
  );
  assert.doesNotMatch(brandVisibility, /addEventListener\("scroll"/);
  assert.match(brandVisibility, /ScrollTrigger\.create/);

  assert.match(cluster, /setAttribute\("aria-hidden",\s*"true"\)/);
  assert.match(cluster, /const compactPortrait = W < 768 && Ht >= W/);
  assert.match(cluster, /copyTop - labelHeight \/ 2 - 22/);
  assert.match(systemMotion, /x:\s*compact \? 0 : 34/);
  assert.match(systemMotion, /y:\s*compact \? 18 : 0/);

  const tabletReview = css.slice(css.indexOf("Tablet review pass"));
  assert.match(tabletReview, /max-width:\s*64rem/);
  assert.match(tabletReview, /\.space,[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(tabletReview, /\.space-stage\s*{[^}]*aspect-ratio:\s*16\s*\/\s*10/s);
  assert.match(tabletReview, /\.lede\s*{[^}]*max-width:\s*100%[^}]*width:\s*100%/s);
  assert.match(tabletReview, /\.ns-root\s*{[^}]*min-height:\s*0/s);
  assert.match(tabletReview, /\.clients-title\s*{[^}]*white-space:\s*nowrap/s);
  assert.match(tabletReview, /\.client-list\s*{[^}]*grid-template-columns:\s*repeat\(8,/s);
  assert.match(tabletReview, /\.inquiry-kicker\s*{[^}]*justify-content:\s*center/s);
  assert.match(tabletReview, /\.site-footer\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*auto/s);

  const mobileReview = css.slice(css.indexOf("Mobile review pass"));
  assert.match(mobileReview, /\.clients-title\s*{[^}]*max-width:\s*26ch[^}]*text-wrap:\s*balance/s);
  assert.match(mobileReview, /\.client-list\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobileReview, /\.client-list li:nth-child\(7\)\s*{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(mobileReview, /\.site-footer\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(mobileReview, /\.site-footer\s*{[^}]*grid-template-rows:\s*auto\s*auto/s);
  assert.match(mobileReview, /\.site-footer-links\s*{[^}]*grid-row:\s*2[^}]*padding-top:\s*0[^}]*border-top:\s*0/s);
  assert.match(mobileReview, /\.site-footer-meta\s*{[^}]*grid-column:\s*2[^}]*grid-row:\s*2/s);
  assert.match(mobileReview, /\.sys-stage\s*{[^}]*order:\s*2[^}]*width:\s*100%/s);
  assert.match(mobileReview, /\.bp\s*{[^}]*width:\s*min\(58vw,\s*15rem\)[^}]*max-height:\s*min\(31dvh,\s*15rem\)/s);
  assert.match(mobileReview, /\.sys-cap\s*{[^}]*display:\s*block[^}]*border-top:\s*1px\s+solid\s+var\(--line\)/s);
  assert.match(mobileReview, /\.sys-item-description\s*{[^}]*display:\s*none\s*!important/s);
});
