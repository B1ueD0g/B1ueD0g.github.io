// Run against a fresh Hugo build. No screenshots or state are written to the repo.
// node scripts/check_not_found.cjs --playwright-module /existing/playwright --output-dir /path/QA/404
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const { chromium } = require(option('--playwright-module', 'playwright'));
const base = option('--base-url', 'http://127.0.0.1:8767');
const output = option('--output-dir', path.join(process.env.HOME,'.codex/work/blog-enhance-20261014/QA/404'));
const visibleFindings = page => page.locator('.signal-finding:not([hidden])').count();
const measure = page => page.evaluate(() => ({
  width:innerWidth,documentWidth:document.documentElement.scrollWidth,
  heading:document.querySelector('h1').textContent,
  beacons:[...document.querySelectorAll('[data-signal]')].map(e=>{
    const r=e.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right};
  }),
  runningAnimations:document.getAnimations().filter(a=>a.playState==='running').length
}));
function validateLayout(data) {
  assert(data.documentWidth<=data.width+1,'404 page has horizontal overflow');
  assert(data.beacons.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=data.width),'Beacon touch target is clipped or undersized');
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const results=[];const errors=[];
  try {
    for(const width of [1440,390]) for(const theme of ['light','dark']) {
      const page=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(theme=>localStorage.setItem('pref-theme',theme),theme);
      await page.goto(`${base}/404.html`,{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.signal-station.is-interactive');
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      const data=await measure(page);validateLayout(data);
      assert.equal(await visibleFindings(page),0,'Discovery links must begin hidden in the game');
      assert.equal(await page.locator('[data-signal]').count(),3);
      const archive=await page.locator('#signal-archive').textContent().then(JSON.parse);
      assert(archive.length>=3 && archive.every(p=>p.title&&p.url.startsWith('/posts/')),'Archive is not real post metadata');
      const links=await page.locator('.signal-finding a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
      assert.equal(new Set(links).size,3,'Signal routes duplicate articles');
      assert(links.every(href=>archive.some(post=>post.url===href)),'Discovery link is not in the Hugo archive');
      for(const href of links) assert.equal((await page.request.get(base+href)).status(),200,'Discovery target does not exist');
      await page.screenshot({path:path.join(output,`${width}-${theme}-initial.png`),fullPage:true});
      const beacons=page.locator('[data-signal]');
      for(let index=0;index<3;index++) {
        await beacons.nth(index).focus();
        await page.keyboard.press(index===1?'Space':'Enter');
        assert.equal(await visibleFindings(page),index+1,'Keyboard activation did not reveal an article');
        assert.equal(await beacons.nth(index).getAttribute('aria-expanded'),'true');
      }
      await beacons.first().click();
      assert.match(await page.locator('#signal-status').textContent(),/^3 \/ 3/,'Repeated activation inflated progress');
      assert.equal((await measure(page)).runningAnimations,0,'Reduced-motion game still animates');
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({path:path.join(output,`${width}-${theme}-found.png`),fullPage:true});
      await page.locator('#signal-reset').click();
      assert.equal(await visibleFindings(page),0);
      assert.equal(await beacons.first().evaluate(e=>document.activeElement===e),true,'Reset lost keyboard focus');
      await Promise.all([page.waitForURL(url=>url.pathname.startsWith('/posts/')),page.locator('#signal-random').click()]);
      assert(archive.some(p=>new URL(p.url,base).pathname===new URL(page.url()).pathname),'Random link left the archive');
      await page.goto(`${base}/404.html`,{waitUntil:'domcontentloaded'});
      await page.locator('#signal-query').fill('拓扑 安全');
      await Promise.all([page.waitForURL(url=>url.pathname==='/search/'),page.locator('.signal-search button').click()]);
      assert.equal(new URL(page.url()).searchParams.get('q'),'拓扑 安全','Search query was lost');
      results.push({width,theme,...data,keyboard:true,search:true,realArticleLinks:links.length});
      await page.close();
    }
    // Functional fallback must retain navigation, GET search, and article links.
    for(const width of [1440,390]) for(const theme of ['light','dark']) {
      const page=await browser.newPage({viewport:{width,height:1000},javaScriptEnabled:false,colorScheme:theme});
      await page.goto(`${base}/404.html`,{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('.signal-fallback a').count(),3);
      assert.equal(await page.locator('.signal-routes a').count(),2);
      assert(await page.locator('.signal-search').isVisible());
      assert.equal(await page.locator('[data-signal]:visible').count(),0);
      assert(await page.locator('#signal-random').getAttribute('href'));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,`${width}-${theme}-no-js.png`),fullPage:true});
      await page.locator('#signal-query').fill('研究');
      await Promise.all([page.waitForURL(url=>url.pathname==='/search/'),page.locator('.signal-search button').click()]);
      assert.equal(new URL(page.url()).searchParams.get('q'),'研究');
      await page.close();
    }
    // The artwork has no perpetual animation even when motion is allowed.
    const motion=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
    await motion.goto(`${base}/404.html`,{waitUntil:'domcontentloaded'});
    await motion.waitForSelector('.signal-station.is-interactive');
    assert.equal(await motion.locator('.signal-station').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations===Infinity).length),0);
    // Page-local styling must not leak into a regular article or the homepage.
    await motion.goto(base+'/',{waitUntil:'domcontentloaded'});
    assert.equal(await motion.locator('link[href*="not-found"]').count(),0);
    await motion.close();
    const rejected={width:390,documentWidth:430,beacons:[]};
    assert.throws(()=>validateLayout(rejected),/horizontal overflow/);
    assert.deepEqual(errors,[],'Browser JavaScript errors');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,noJS:true,noPerpetualMotion:true,negativeOverflowRejected:true,pageErrors:errors},null,2));
    console.log('PASS: 404 station; 4 viewport/theme cases, keyboard discovery/reset, real article/random routes, GET search, no-JS fallback, reduced motion, no style leakage.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
