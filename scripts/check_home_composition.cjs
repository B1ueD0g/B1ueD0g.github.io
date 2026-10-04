// Run after a build and serving public/: node scripts/check_home_composition.cjs
// Pass --playwright-module when using an existing external Playwright runtime.
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const { chromium } = require(option('--playwright-module', 'playwright'));
const base = option('--base-url', 'http://127.0.0.1:8767');
const output = option('--output-dir', '/tmp/bluedog-home-composition');
const sizes = [[1800,1008],[1920,1080],[1440,1080],[1440,900],[1440,812],
  [1366,768],[1280,720],[1101,650],[1440,650],[1024,768],[390,844]];

async function measure(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const element = document.querySelector(selector);
      const r = element.getBoundingClientRect();
      return { x:r.x, top:r.top, bottom:r.bottom, width:r.width, height:r.height,
        fontSize:parseFloat(getComputedStyle(element).fontSize) };
    };
    const header = rect('.header');
    const footer = rect('.custom-min-footer');
    const info = rect('.home-info');
    const curation = rect('.home-curation');
    const top = Math.min(info.top, curation.top);
    const bottom = Math.max(info.bottom, curation.bottom);
    return { width:innerWidth, height:innerHeight, docHeight:document.documentElement.scrollHeight,
      overflow:document.documentElement.scrollWidth > innerWidth + 1,
      main:rect('.main'), nav:rect('.header .nav'), header, footer, info, curation,
      headline:rect('.home-info h1'), article:rect('.home-stream-title'),
      topGap:top-header.bottom, bottomGap:footer.top-bottom,
      occupancy:(bottom-top)/(footer.top-header.bottom) };
  });
}

function validate(data) {
  assert(!data.overflow, 'Horizontal overflow');
  if (data.width < 1101) return;
  assert(data.docHeight <= data.height + 1, 'Desktop is not a single screen');
  assert(data.footer.bottom <= data.height + 1, 'Footer outside the viewport');
  assert(data.topGap >= 12 && data.bottomGap >= 12, 'Composition touches page boundaries');
  assert(Math.abs(data.topGap-data.bottomGap) <= 48, 'Vertical whitespace imbalance');
  assert(Math.abs(data.main.x-data.nav.x) <= 2, 'Navigation and content axes differ');
  assert(Math.abs(data.main.width-data.nav.width) <= 2, 'Navigation and content widths differ');
  if (data.width >= 1600 && data.height >= 900) {
    assert(data.main.width/data.width >= 0.76, 'Large-screen container is too narrow');
    assert(data.occupancy >= 0.70 && data.occupancy <= 0.94, 'Large-screen content occupancy is wrong');
    assert(data.headline.fontSize >= 84, 'Large-screen headline is underscaled');
    assert(data.article.fontSize >= 19, 'Large-screen article type is underscaled');
  }
}

(async () => {
  await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const results = [];
  try {
    for (const [width,height] of sizes) {
      const page = await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
      try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(base, {waitUntil:'networkidle'});
        assert.equal(response.status(), 200);
        await page.evaluate(() => document.fonts.ready);
        for (const theme of ['light','dark']) {
          if (theme === 'dark') {
            await page.locator('#theme-toggle').click();
            await page.waitForTimeout(250);
          }
          const data = await measure(page);
          validate(data);
          const clipped = await page.locator('.home-info,.home-stream-title,.home-surface-card,.home-primary-links a,.home-atlas-name').evaluateAll(
            elements => elements.filter(e => e.scrollWidth>e.clientWidth+1 || e.scrollHeight>e.clientHeight+1).map(e => e.className));
          assert.deepEqual(clipped, [], `Clipped content at ${width}x${height}`);
          const input = await page.locator('#home-search-input').boundingBox();
          const button = await page.locator('#home-search-btn').boundingBox();
          assert(Math.abs(input.y-button.y)<=2, 'Home search is not a single row');
          await page.screenshot({path:path.join(output,`${width}x${height}-${theme}.png`)});
          results.push({...data,theme});
        }
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }
    // Reintroduce the rejected large-screen geometry in a browser-only fixture.
    // A visible footer alone must not allow the shrunken, top-heavy layout to pass.
    const control = await browser.newPage({viewport:{width:1800,height:1008}});
    await control.goto(base, {waitUntil:'networkidle'});
    await control.addStyleTag({content:`
      html.bd-cold-lab body.home-page .main {width:1180px!important;align-items:flex-start!important}
      html.bd-cold-lab body.home-page .home-info h1 {font-size:75.2px!important}
      html.bd-cold-lab body.home-page .home-surface-card {padding:20px!important}
      html.bd-cold-lab body.home-page .home-stream-item {padding-block:10px!important}
      html.bd-cold-lab body.home-page .home-stream-title {font-size:16px!important}`});
    const controlData = await measure(control);
    assert.throws(() => validate(controlData), /imbalance|too narrow|axes differ|widths differ|occupancy|underscaled/,
      'Rejected top-heavy geometry escaped the regression checks');
    await control.close();
    await fs.writeFile(path.join(output,'results.json'), JSON.stringify({results,negativeControlRejected:true}, null, 2));
    console.log(`PASS: ${sizes.length} viewports, both themes, layout negative control rejected.`);
    console.log(JSON.stringify(results.filter(r => r.theme==='light' && r.width>=1101).map(r => ({
      viewport:`${r.width}x${r.height}`,width:r.main.width,occupancy:r.occupancy,
      topGap:r.topGap,bottomGap:r.bottomGap,headline:r.headline.fontSize,article:r.article.fontSize}))));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
