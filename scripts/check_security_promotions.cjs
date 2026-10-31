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
const expectedCves = ['CVE-2026-92701', 'CVE-2026-92702', 'CVE-2026-109358', ...Array.from({length:5}, (_, i) => `CVE-2026-${108265 + i}`)].sort();
const newGhsas = ['GHSA-qp28-6j56-j83v', 'GHSA-j83r-456j-5qj2', 'GHSA-58mm-x75f-qv9h', 'GHSA-83wg-c3jj-cf77', 'GHSA-2w6f-8xrm-f9xw', 'GHSA-gh56-wjpj-xppq', 'GHSA-4pqf-h3v4-fq3c', 'GHSA-4456-rr46-r7v6', 'GHSA-qrvp-grrm-qpqv'];
const ietfUpdates = [
  ['https://datatracker.ietf.org/doc/draft-bu-agentproto-security-principal-binding/', '-08 · 2026-10-13'],
  ['https://datatracker.ietf.org/doc/draft-intra-handshake-fail/', '-58 · 2026-10-28']
];
const pendingStandards = ['零信任可信接口规范', '《医疗人工智能应用 数据安全与隐私保护规范》-中国电子商会', '《人工智能生成内容 合规管理指南》-中国电子商会', '大模型驱动的安全运营工具技术要求-信通院'].sort();

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
  const inventory = JSON.parse(await fs.readFile(path.join(__dirname, '../docs/public-security-audit-2026-11-01.json'), 'utf8'));
  const records = inventory.records;
  assert.deepEqual(ledger.security_promotions.map(p => p.cve).sort(), Array.from({length:5}, (_, i) => `CVE-2026-${108265 + i}`));
  // Every CVE card is checked, including the new Contrast promotion and the original Cocos records.
  const promotions = records.filter(r => r.cve_id).map(r => ({cve:r.cve_id, ghsa:r.ghsa_id, url:r.url, cve_url:`https://www.cve.org/CVERecord?id=${r.cve_id}`}));
  const expectedIds = records.filter(r => r.cve_id).map(r => r.cve_id);
  const expectedSources = records.map(r => r.url);
  const directory = records.filter(r => !r.cve_id);
  assert.equal(records.length, 39, 'Current public inventory must contain 39 unique advisories');
  assert.equal(new Set(expectedSources).size, 39, 'Public inventory contains duplicate vendor sources');
  assert.deepEqual(expectedIds.slice().sort(), expectedCves, 'Current public inventory must contain the verified eight CVEs');
  assert.equal(directory.length, 31, 'Current public inventory must contain 31 GHSA-only entries');
  assert.deepEqual(records.filter(r => newGhsas.includes(r.ghsa_id)).map(r => r.ghsa_id).sort(), newGhsas.slice().sort(), 'New public GHSA set is incomplete');
  const contrastPromotion = promotions.find(p => p.ghsa === 'GHSA-376m-h37w-4rvq');
  assert(contrastPromotion && contrastPromotion.cve === 'CVE-2026-109358', 'Contrast GHSA was not upgraded to its official CVE');
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
        for (const [url,version] of ietfUpdates) {
          // The card is itself the anchor, so resolve it by its observed href rather than a descendant.
          const card = page.locator(`.about-ietf-item[href="${url}"]`);
          assert.equal(await card.count(), 1);
          assert((await card.innerText()).includes(version), `Stale IETF revision for ${url}`);
          assert((await card.textContent()).includes('Active individual I-D'), 'An individual draft was promoted to a formal standard');
        }
        const pending = await page.locator('#about-work-panel-inprogress .about-work-item').evaluateAll(es => es.filter(e => e.querySelector('.about-work-type').textContent.trim() === '编制-标准（待发布）').map(e => e.querySelector('.about-work-title').textContent.trim()).sort());
        assert.deepEqual(pending, pendingStandards, 'Unreleased standards were promoted, removed or renamed');
        const publishedWorkTitles = await page.locator('#about-work-panel-published .about-work-title').allTextContents();
        assert(!publishedWorkTitles.some(t => pendingStandards.includes(t.trim())), 'Unreleased standard appeared in the published panel');
        const groups = await page.locator('.security-vendor-group').evaluateAll(es => es.map(e => ({name:e.querySelector('.security-vendor-name').textContent.trim(), count:e.querySelectorAll('.security-advisory').length, label:e.querySelector('.security-vendor-count').textContent.trim(), open:e.open})));
        assert.deepEqual(groups, vendorPrefixes.map(([name,prefix]) => {
          const count = directory.filter(r => r.url.startsWith(prefix)).length;
          return {name,count,label:`${count} GHSA`,open:false};
        }).filter(g => g.count > 0));
        assert(!groups.some(g => g.name === 'Contrast'), 'Promoted Contrast source remained in the GHSA directory');
        const layout = await page.evaluate(() => {
          const grid = document.querySelector('.security-featured-grid').getBoundingClientRect();
          const cards = [...document.querySelectorAll('.security-featured-card')];
          const tail = cards.at(-1).getBoundingClientRect();
          const actions = [...document.querySelectorAll('.security-card-actions a')].map(e => e.getBoundingClientRect());
          return {overflow:document.documentElement.scrollWidth > innerWidth + 1, clipped:actions.some(r => r.left < 0 || r.right > innerWidth + 1), tailFillsRow:Math.abs(tail.width - grid.width) <= 1 && Math.abs(tail.x - grid.x) <= 1};
        });
        assert(!layout.overflow && !layout.clipped, 'Security layout overflows or clips');
        if (expectedIds.length % 2) assert(layout.tailFillsRow, 'Odd CVE tail leaves an empty grid cell');
        else if (width > 700) assert(!layout.tailFillsRow, 'Even CVE inventory should retain balanced two-column rows');
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
          const duplicateContrast = structuredClone(actual);
          duplicateContrast.directory.push(contrastPromotion.url);
          duplicateContrast.sources.push(contrastPromotion.url);
          assert.throws(() => validateInventory(duplicateContrast, expectedIds, expectedSources, promotions));
          const legacy = structuredClone(actual);
          const newSources = new Set(records.filter(r => newGhsas.includes(r.ghsa_id)).map(r => r.url));
          legacy.sources = legacy.sources.filter(url => !newSources.has(url));
          legacy.directory = legacy.directory.filter(url => !newSources.has(url));
          legacy.ids = legacy.ids.filter(id => id !== contrastPromotion.cve);
          legacy.cards = legacy.cards.filter(c => c.id !== contrastPromotion.cve);
          legacy.directory.push(contrastPromotion.url);
          assert.throws(() => validateInventory(legacy, expectedIds, expectedSources, promotions));
        }
        results.push({width,theme,cves:actual.ids.length,ghsas:actual.directory.length,groups:groups.map(g => `${g.name}:${g.count}`),...layout});
        await page.close();
      }
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(output,'results.json'), JSON.stringify(results,null,2));
  console.log(`PASS: ${promotions.length} verified CVE mappings and 31 GHSA-only entries; ${results.length} rendered viewport/theme cases; IETF revisions and pending standards retained; duplicate-source, swapped-URL and legacy-inventory negative controls rejected.`);
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode=1; });
