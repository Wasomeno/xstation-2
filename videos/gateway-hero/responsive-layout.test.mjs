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
  assert.equal((html.match(/class="[^"]*station-cta\b/g) || []).length, 10);
  assert.equal((html.match(/media\/clients\//g) || []).length, 2);
  assert.doesNotMatch(html, /id="site-links"|class="site-footer-links"/);

  const products = ["bikinkonten", "lubna", "crm-ai-agent", "hireassess", "arkiv", "codev", "coframe", "cofinance"];
  let previous = -1;
  for (const id of products) {
    const index = html.indexOf(`id="${id}"`);
    assert.ok(index > previous, `${id} remains present and in desktop order`);
    previous = index;
  }
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
  assert.match(work, /voiceSurface\.getBoundingClientRect\(\)\.top/);
  assert.match(cluster, /const phone = W < 768;/);
  assert.match(cluster, /const tablet = W >= 768 && W < 1024;/);
  assert.match(cluster, /const labelY = Math\.min/);
});
