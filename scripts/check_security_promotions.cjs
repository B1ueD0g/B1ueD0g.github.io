// Run against a freshly built public/ server; --base-url can verify a deployment.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const { chromium } = require(option('--playwright-module', 'playwright'));
const base = option('--base-url', 'http://127.0.0.1:8767');
const output = option('--output-dir', '/tmp/bluedog-security-promotions');
const vendorPrefixes = [
  ['Privasys', 'https://github.com/Privasys/'],
  ['Veraison', 'https://github.com/veraison/'],
  ['Cocos AI', 'https://github.com/ultravioletrs/cocos/'],
  ['Contrast', 'https://github.com/edgelesssys/contrast/']
];

function validateInventory(actual, expectedIds, expectedSources, promotions) {
  assert.deepEqual(actual.ids.slice().sort(), expectedIds.slice().sort(), 'Wrong CVE inventory');
  assert.deepEqual(actual.sources.slice().sort(), expectedSources.slice().sort(), 'Missing or repeated advisory source');
  for (const promotion of promotions) {
    const card = actual.cards.find(c => c.id === promotion.cve);
    assert(card, `Missing CVE: ${promotion.cve}`);
    assert.equal(card.cve, promotion.cve_url, 'Swapped official CVE URL');
    assert.equal(card.vendor, promotion.url, 'Wrong vendor advisory');
    assert(!actual.directory.includes(promotion.url), `Duplicate GHSA: ${promotion.ghsa}`);
  }
}

(async () => {
  const ledger = JSON.parse(await fs.readFile(path.join(__dirname, '../docs/profile-refresh-2026-10-04.json'), 'utf8'));
  const records = ledger.records.filter(r => r.section === 'security');
  const promotions = ledger.security_promotions;
  assert.deepEqual(promotions.map(p => p.cve).sort(), Array.from({length:5}, (_, i) => `CVE-2026-${108265 + i}`));
  const expectedIds = records.filter(r => r.id.startsWith('CVE-')).map(r => r.id);
  const expectedSources = records.map(r => r.url);
  const directory = records.filter(r => !r.id.startsWith('CVE-'));
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const results = [];
  await fs.mkdir(output, {recursive:true});
  try {
    for (const width of [360, 390, 768, 1440]) {
      for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({viewport:{width,height:1000}, reducedMotion:'reduce'});
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(value => localStorage.setItem('pref-theme', value), theme);
        const response = await page.goto(`${base}/research/`, {waitUntil:'networkidle'});
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        const actual = await page.locator('#about-security').evaluate(e => ({
          ids:[...e.querySelectorAll('.security-cve-id')].map(x => x.textContent.trim()),
          sources:[...e.querySelectorAll('a[href*="/security/advisories/"]')].map(x => x.href),
          directory:[...e.querySelectorAll('.security-advisory')].map(x => x.href),
          cards:[...e.querySelectorAll('.security-featured-card')].map(x => ({id:x.querySelector('.security-cve-id').textContent.trim(), cve:x.querySelector('.about-cve-link').href, vendor:x.querySelector('.security-source-link').href}))
        }));
        validateInventory(actual, expectedIds, expectedSources, promotions);
        assert.equal(actual.directory.length, directory.length);
        const groups = await page.locator('.security-vendor-group').evaluateAll(es => es.map(e => ({name:e.querySelector('.security-vendor-name').textContent.trim(), count:e.querySelectorAll('.security-advisory').length, label:e.querySelector('.security-vendor-count').textContent.trim(), open:e.open})));
        assert.deepEqual(groups, vendorPrefixes.map(([name,prefix]) => {
          const count = directory.filter(r => r.url.startsWith(prefix)).length;
          return {name,count,label:`${count} GHSA`,open:false};
        }));
        const layout = await page.evaluate(() => {
          const grid = document.querySelector('.security-featured-grid').getBoundingClientRect();
          const cards = [...document.querySelectorAll('.security-featured-card')];
          const tail = cards.at(-1).getBoundingClientRect();
          const actions = [...document.querySelectorAll('.security-card-actions a')].map(e => e.getBoundingClientRect());
          return {overflow:document.documentElement.scrollWidth > innerWidth + 1, clipped:actions.some(r => r.left < 0 || r.right > innerWidth + 1), tailFillsRow:Math.abs(tail.width - grid.width) <= 1 && Math.abs(tail.x - grid.x) <= 1};
        });
        assert(!layout.overflow && !layout.clipped, 'Security layout overflows or clips');
        if (expectedIds.length % 2) assert(layout.tailFillsRow, 'Odd CVE tail leaves an empty grid cell');
        await page.locator('#about-security').screenshot({path:path.join(output, `${width}-${theme}.png`)});
        for (let i=0; i<groups.length; i++) {
          const group = page.locator('.security-vendor-group').nth(i);
          await group.locator('summary').click();
          assert(await group.evaluate(e => e.open), 'Advisory directory did not expand');
          assert(await group.locator('.security-advisory').first().isVisible());
          await group.locator('summary').click();
        }
        assert.deepEqual(errors, []);
        if (!results.length) {
          const duplicate = structuredClone(actual);
          duplicate.directory.push(promotions[0].url);
          duplicate.sources.push(promotions[0].url);
          assert.throws(() => validateInventory(duplicate, expectedIds, expectedSources, promotions));
          const swapped = structuredClone(actual);
          swapped.cards.find(c => c.id === promotions[0].cve).cve = promotions[1].cve_url;
          assert.throws(() => validateInventory(swapped, expectedIds, expectedSources, promotions));
        }
        results.push({width,theme,cves:actual.ids.length,ghsas:actual.directory.length,groups:groups.map(g => `${g.name}:${g.count}`),...layout});
        await page.close();
      }
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(output,'results.json'), JSON.stringify(results,null,2));
  console.log(`PASS: ${promotions.length} CVE promotions; ${results.length} rendered viewport/theme cases; duplicate-source and swapped-URL negative controls rejected.`);
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode=1; });
