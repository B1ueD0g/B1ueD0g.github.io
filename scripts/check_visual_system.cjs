// Production browser regression checks for the editorial visual system.
// Serve public/ first. Use --playwright-module to reuse an installed runtime.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const { chromium } = require(arg('--playwright-module', 'playwright'));
const base = arg('--base-url', 'http://127.0.0.1:8767');
const out = arg('--output-dir', '/tmp/bluedog-visual-system');
const article = '/posts/archive/技术好文/digital-government-integrated-security/';
const codeArticle = '/posts/archive/技术好文/openclaw-raspberrypi-deployment/';
const routes = ['/', '/posts/', '/about/', '/research/', '/search/', article, codeArticle];
const names = ['home', 'articles', 'about', 'research', 'search', 'article', 'code'];
const readableNav = data => assert(data.every(x => x.font >= 12 && x.height >= 44),
  `Unreadable mobile section navigation: ${JSON.stringify(data)}`);

async function checkResearchLists(page, width) {
  const data = await page.evaluate(() => {
    const rect = e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const contentX = e => { const c=getComputedStyle(e); return e.getBoundingClientRect().x+parseFloat(c.paddingLeft)+parseFloat(c.borderLeftWidth); };
    const records=[...document.querySelectorAll('.research-pro .about-record-list li')];
    const works=[...document.querySelectorAll('.research-pro .about-work-item')];
    return {
      selected:document.querySelectorAll('.research-selected,.research-selected-item').length,
      indexNodes:document.querySelectorAll('.research-pro .about-record-index,.research-pro .about-work-item[data-index]').length,
      pseudo:[...records,...works].flatMap(e=>['::before','::after'].map(p=>getComputedStyle(e,p).content)),
      records:records.filter(e=>e.getClientRects().length).map(e=>({row:rect(e),contentX:contentX(e),copy:rect(e.querySelector('.about-record-copy'))})),
      works:works.filter(e=>e.getClientRects().length).map(e=>({row:rect(e),contentX:contentX(e),columns:getComputedStyle(e).gridTemplateColumns.split(/\s+/).map(Number.parseFloat),gap:parseFloat(getComputedStyle(e).columnGap),type:rect(e.querySelector('.about-work-type')),main:rect(e.querySelector('.about-work-main')),typeFont:parseFloat(getComputedStyle(e.querySelector('.about-work-type')).fontSize),titleFont:parseFloat(getComputedStyle(e.querySelector('.about-work-title')).fontSize)})),
      dois:[...document.querySelectorAll('#research-papers .research-doi')].map(e=>e.textContent.trim()).sort(),
      doiLinks:document.querySelectorAll('#research-papers a.research-doi-link').length,
      paperLinks:[...document.querySelectorAll('#research-papers .about-record-copy')].map(e=>e.querySelector(':scope > a')?.href || '')
    };
  });
  assert.equal(data.selected,0,'Removed Selected Work section returned');
  assert.equal(data.indexNodes,0,'Research retained decorative index nodes');
  assert(data.pseudo.every(x=>['none','normal','""'].includes(x)),`Research generated decorative list content: ${JSON.stringify(data.pseudo)}`);
  assert(data.records.every(r=>Math.abs(r.copy.x-r.contentX)<=1),'Research records retain an empty index column');
  assert(data.works.length>0,'Research work panel has no visible rows');
  for(const row of data.works) {
    assert(Math.abs(row.type.x-row.contentX)<=1,'Work type does not start at the content edge');
    assert(row.typeFont>=14.07&&row.titleFont>=16,'Research work type/title was reduced below its original readable size');
    if(width>700) {
      assert.equal(row.columns.length,2,'Work row retains an index column');
      assert(Math.abs(row.main.x-(row.contentX+row.columns[0]+row.gap))<=1,'Work title does not follow the type column');
      assert(row.main.width>=row.row.width*0.7,'Work title lost its content width');
    } else {
      assert.equal(row.columns.length,1,'Mobile work row retains an empty column');
      assert(Math.abs(row.main.x-row.contentX)<=1,'Mobile work title is indented into an empty column');
      assert(row.main.y>=row.type.y+row.type.height-1,'Mobile work type and title overlap');
    }
  }
  assert.equal(data.doiLinks,0,'DOI values must be plain identifiers');
  assert(data.paperLinks.every(href=>/^https?:/.test(href)),'Paper title lost its source link');
  return data;
}

(async () => {
  await fs.mkdir(out, {recursive:true});
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const results = [];
  const pageErrors = [];
  const coldLoads = [];
  const expectedDOIs=[...(await fs.readFile(path.join(__dirname,'../data/about.yaml'),'utf8')).matchAll(/^\s+doi:\s*"([^"]+)"/gm)].map(m=>m[1]).sort();
  try {
    for (const width of [1440, 390]) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({viewport:{width,height:width===390?844:1000}, reducedMotion:'reduce'});
        await context.addInitScript(value => localStorage.setItem('pref-theme', value), theme);
        const page = await context.newPage();
        page.on('pageerror', e => pageErrors.push(e.message));
        for (let i=0;i<routes.length;i++) {
          const response = await page.goto(base+routes[i], {waitUntil:'domcontentloaded'});
          assert.equal(response.status(),200, routes[i]);
          await page.waitForSelector('html.bd-ready');
          await page.evaluate(() => document.fonts.ready);
          // Let deferred enhancement complete before measuring its settled state.
          await page.waitForTimeout(350);
          await page.waitForFunction(() => document.getAnimations().every(a=>a.playState!=='running'), null, {timeout:3000});
          const metrics = await page.evaluate(() => ({
            width:innerWidth, docWidth:document.documentElement.scrollWidth,
            scrollY,
            theme:document.documentElement.dataset.theme,
            nav:[...document.querySelectorAll('.about-section-nav a')].map(e=>({
              font:parseFloat(getComputedStyle(e).fontSize),height:e.getBoundingClientRect().height})),
            animations:document.getAnimations().filter(a=>a.playState==='running').map(a=>({target:a.effect?.target?.className,duration:a.effect?.getTiming().duration})),
            firstArticleTop:document.querySelector('.home-stream-title')?.getBoundingClientRect().top,
            headings:[...document.querySelectorAll('h1')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth}))
          }));
          assert(metrics.docWidth<=width+1, `Horizontal overflow ${width} ${theme} ${routes[i]}: ${metrics.docWidth}`);
          assert.equal(metrics.theme,theme);
          assert(metrics.headings.every(h=>h.scroll<=h.width+1), `Clipped heading: ${routes[i]}`);
          assert.deepEqual(metrics.animations,[],`Reduced motion still has running animations ${routes[i]}`);
          if(i===4) assert.equal(metrics.scrollY,0,'Search initialization scrolled the page');
          if(width===390 && metrics.nav.length) readableNav(metrics.nav);
          if(width===390 && i===0) assert(metrics.firstArticleTop<784,'First article is still too far below the mobile fold');
          if(i===2) {
            const profileLinks=page.locator('.about-profile-nav a');
            assert.deepEqual(await profileLinks.allTextContents(),['Profile','Highlights','Credentials','Honors','Now']);
            assert(metrics.nav.every(n=>n.font>=13&&n.height>=44),'Profile index is unreadable');
            for(let section=0;section<5;section++) {
              const href=await profileLinks.nth(section).getAttribute('href');
              await profileLinks.nth(section).click();
              await page.waitForFunction(hash=>location.hash===hash,href);
              assert(await page.locator(href).evaluate(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}),'Profile index did not reveal its target');
            }
            await page.evaluate(()=>window.scrollTo(0,0));
            assert(await page.locator('#about-identity').isVisible(),'About identity content disappeared');
            assert(await page.locator('#about-highlights').isVisible(),'About highlights content disappeared');
          }
          if(i===3) {
            const sectionLinks=page.locator('.about-section-nav a');
            assert.equal(await sectionLinks.count(),4,'Research lost its four section links');
            for(let section=0;section<4;section++) {
              const href=await sectionLinks.nth(section).getAttribute('href');
              assert.equal(await page.locator(href).count(),1,'Research section target is missing');
              await sectionLinks.nth(section).click();
              await page.waitForFunction(hash=>location.hash===hash,href);
              const top=await page.locator(href).evaluate(e=>e.getBoundingClientRect().top);
              assert(top>=0&&top<=260,'Research section navigation did not reveal its target');
            }
            metrics.researchPanels=[];
            const workTabs=page.locator('.about-work-tab');
            for(let tab=0;tab<await workTabs.count();tab++) {
              await workTabs.nth(tab).click();
              await page.waitForTimeout(350);
              const panel=await checkResearchLists(page,width);
              assert.deepEqual(panel.dois,expectedDOIs,'Paper DOI identifiers changed');
              metrics.researchPanels.push(panel);
            }
            await workTabs.first().click();
            await page.waitForTimeout(350);
            await page.evaluate(()=>window.scrollTo(0,document.querySelector('#about-works').getBoundingClientRect().top+scrollY-90));
            await page.screenshot({path:path.join(out,`research-works-${width}-${theme}.png`)});
            await page.evaluate(()=>window.scrollTo(0,0));
          }
          await page.screenshot({path:path.join(out,`${names[i]}-${width}-${theme}.png`)});
          results.push({route:routes[i],theme,...metrics});
        }
        await context.close();
      }
    }
    // The final homepage geometry must exist before deferred enhancement loads.
    for(const delay of [0,250,1000]) {
      const cold=await browser.newPage({viewport:{width:412,height:823},isMobile:true,reducedMotion:'reduce'});
      await cold.addInitScript(()=>{
        window.__layoutShifts=[];
        new PerformanceObserver(list=>{
          for(const entry of list.getEntries()) if(!entry.hadRecentInput) window.__layoutShifts.push(entry.value);
        }).observe({type:'layout-shift',buffered:true});
      });
      if(delay) await cold.route('**/js/site-enhance*',async route=>{
        await new Promise(resolve=>setTimeout(resolve,delay));
        await route.continue();
      });
      await cold.goto(base+'/',{waitUntil:'domcontentloaded'});
      await cold.waitForSelector('html.bd-ready');
      await cold.evaluate(()=>document.fonts.ready);
      await cold.waitForTimeout(350);
      const cls=await cold.evaluate(()=>window.__layoutShifts.reduce((a,b)=>a+b,0));
      assert(cls<=0.1,`Cold homepage layout shifted with ${delay}ms enhancement delay: ${cls}`);
      coldLoads.push({delay,cls});
      await cold.close();
    }
    const noJS=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});
    await noJS.goto(base+'/',{waitUntil:'domcontentloaded'});
    await noJS.evaluate(()=>document.fonts.ready);
    const noJSArticle=await noJS.locator('.home-stream-title').first().boundingBox();
    assert(noJSArticle&&noJSArticle.y<784,'No-JS mobile homepage lost its reading starting point');
    assert(await noJS.locator('#home-search-input').isVisible(),'No-JS homepage lost search');
    await noJS.screenshot({path:path.join(out,'home-no-js-mobile.png')});
    await noJS.close();
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addInitScript(() => localStorage.setItem('pref-theme','light'));
    const page = await context.newPage();
    page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(base+article,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.editorial-toc-rail.is-drawer');
    const body = page.locator('#editorial-toc-panel');
    assert(await body.evaluate(e=>e.inert),'Closed TOC is not inert');
    await page.locator('.editorial-toc-toggle').click();
    assert.equal(await page.locator('.editorial-toc-toggle').getAttribute('aria-expanded'),'true');
    assert(await body.evaluate(e=>e.contains(document.activeElement)),'TOC open did not receive focus');
    await page.keyboard.press('Escape');
    assert(await body.evaluate(e=>e.inert));
    assert(await page.locator('.editorial-toc-toggle').evaluate(e=>e===document.activeElement));
    await page.locator('.editorial-toc-toggle').click();
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>!document.querySelector('.editorial-toc-rail').classList.contains('is-drawer'));
    assert(await page.locator('.editorial-toc summary').evaluate(e=>e===document.activeElement),'Mobile TOC did not receive focus after resizing');
    assert(!(await body.evaluate(e=>e.inert)),'Mobile TOC remained inert');
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForSelector('.editorial-toc-rail.is-drawer');
    assert(await page.locator('.editorial-toc-toggle').evaluate(e=>e===document.activeElement),'Desktop TOC did not recover focus after resizing');
    assert(await body.evaluate(e=>e.inert),'Resized closed drawer is not inert');
    await page.locator('[data-share-open]').click();
    const panel = page.locator('.bd-share-panel');
    assert(await panel.isVisible());
    await page.locator('[data-share-action="wechat"]').click();
    assert(await page.locator('[data-share-wechat-back]').evaluate(e=>e===document.activeElement));
    for(let i=0;i<10;i++) {
      await page.keyboard.press('Tab');
      assert(await panel.evaluate(e=>e.contains(document.activeElement)&&!document.activeElement.closest('[hidden],[inert]')),
        'Share focus escaped or entered a hidden view');
    }
    await page.locator('[data-share-wechat-back]').click();
    assert(await page.locator('[data-share-action="wechat"]').evaluate(e=>e===document.activeElement));
    await page.keyboard.press('Escape');
    assert(await page.locator('[data-share-open]').evaluate(e=>e===document.activeElement));
    await page.goto(base+'/research/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('html.bd-ready');
    const tabs=page.locator('[role="tab"]');
    assert.equal(await tabs.count(),3);
    for(let i=0;i<3;i++) {
      await tabs.nth(i).click();
      assert.equal(await tabs.nth(i).getAttribute('aria-selected'),'true');
      await page.waitForTimeout(350);
      await checkResearchLists(page,1440);
    }
    await page.goto(base+'/search/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('html.bd-ready');
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>scrollY),0,'Initial search hydration changed the scroll position');
    const secondResult=page.locator('.search-result-card').nth(1);
    await secondResult.dispatchEvent('pointerover');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>scrollY),0,'Result pointer feedback scrolled the page');
    await page.locator('#search-query-input').fill('SDN');
    await page.waitForFunction(()=>document.querySelector('#search-status').textContent.includes('找到'));
    assert((await page.locator('.search-result-card').count())>0);
    assert((await page.locator('.search-result-card').first().textContent()).includes('SDN'));
    await page.waitForFunction(()=>document.querySelector('#search-results').getAttribute('aria-busy')==='false');
    await page.locator('#search-query-input').focus();
    await page.keyboard.press('ArrowDown');
    assert(await page.locator('.search-result-title a').first().evaluate(e=>e===document.activeElement),'Search keyboard navigation did not focus a result');
    await page.waitForTimeout(450);
    assert(await page.locator('.search-result-title a').first().evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Keyboard-selected result is outside the viewport');
    await page.keyboard.press('ArrowUp');
    assert(await page.locator('#search-query-input').evaluate(e=>e===document.activeElement),'ArrowUp from the first result did not return to search');
    await page.locator('#search-query-input').fill('no-such-entry-20261014-visual-control');
    await page.waitForFunction(()=>document.querySelector('#search-status').textContent.includes('没有匹配'));
    assert.equal(await page.locator('.search-result-card').count(),0);
    // Exercise content below the fold: horizontal scrolling must stay local.
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:width===390?844:1000});
      for(const theme of ['light','dark']) {
        await page.goto(base+codeArticle,{waitUntil:'domcontentloaded'});
        await page.waitForSelector('html.bd-ready');
        if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme) await page.locator('#theme-toggle').click();
        await page.waitForFunction(value=>document.documentElement.dataset.theme===value&&!document.documentElement.classList.contains('bd-theme-reveal'),theme);
        const code=page.locator('pre').first();
        await code.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Code scrolled the whole page horizontally');
        assert(await code.evaluate(e=>['auto','scroll','hidden'].includes(getComputedStyle(e).overflowX)),'Code block has no local overflow handling');
        await page.screenshot({path:path.join(out,`code-detail-${width}-${theme}.png`)});
        if(width===390) {
          const summary=page.locator('.editorial-toc details summary');
          await summary.click();
          assert(await summary.evaluate(e=>e.parentElement.open),'Mobile TOC did not open');
          await summary.click();
          assert(!(await summary.evaluate(e=>e.parentElement.open)),'Mobile TOC did not close');
          await page.locator('[data-share-open]').click();
          const box=await page.locator('.bd-share-panel').boundingBox();
          assert(box.x>=-1&&box.x+box.width<=391,'Mobile share panel exceeds viewport');
          await page.keyboard.press('Escape');
        }
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/research/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('html.bd-ready');
    assert.equal(await page.locator('.about-section-nav a').count(),4,'Research navigation negative control has no targets');
    const navMetrics = () => page.locator('.about-section-nav a').evaluateAll(es=>es.map(e=>({font:parseFloat(getComputedStyle(e).fontSize),height:e.getBoundingClientRect().height})));
    readableNav(await navMetrics());
    await page.locator('.about-section-nav a').evaluateAll(es=>es.forEach(e=>e.style.setProperty('font-size','8px','important')));
    const badNav=await navMetrics();
    assert(badNav.every(x=>x.font===8),'Negative fixture failed to apply');
    assert.throws(()=>readableNav(badNav),/Unreadable/,'Unreadable navigation negative control escaped');
    // Motion is event-driven, bounded, and stops when the reader requests less.
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('html.bd-ready');
    await page.evaluate(()=>document.fonts.ready);
    const hero=page.locator('.home-info');
    const heroBefore=await hero.boundingBox();
    const moveToHero=()=>page.mouse.move(heroBefore.x+heroBefore.width*.85,heroBefore.y+heroBefore.height*.25);
    await moveToHero();
    await page.waitForSelector('html[data-bd-motion="active"]');
    const field=await hero.evaluate(e=>({x:parseFloat(e.style.getPropertyValue('--bd-field-x')),y:parseFloat(e.style.getPropertyValue('--bd-field-y'))}));
    assert(Math.abs(field.x)<=8&&Math.abs(field.y)<=6,'Decorative field motion exceeds its bound');
    assert.deepEqual(await hero.boundingBox(),heroBefore,'Pointer motion changed content geometry');
    await page.mouse.move(8,8);
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-bd-motion'));
    await moveToHero();
    await page.waitForSelector('html[data-bd-motion="active"]');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-bd-motion'));
    assert.equal(await hero.evaluate(e=>e.style.getPropertyValue('--bd-field-x')),'','Reduced motion retained pointer state');
    await page.locator('#theme-toggle').click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
    assert(!(await page.locator('html').evaluate(e=>e.classList.contains('bd-theme-reveal'))),'Reduced motion started a theme reveal');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#theme-toggle').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getAnimations().some(a=>a.effect?.pseudoElement==='::view-transition-new(root)'));
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light'&&!document.documentElement.classList.contains('bd-theme-reveal'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('pref-theme')),'light');
    await page.evaluate(()=>{const toggle=document.querySelector('#theme-toggle');toggle.click();toggle.click();});
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light'&&!document.documentElement.classList.contains('bd-theme-reveal'));
    const boundedAnimations=await page.evaluate(()=>document.getAnimations().every(a=>Number.isFinite(a.effect.getTiming().iterations)));
    assert(boundedAnimations,'An ambient animation has no finite ending');
    await page.screenshot({path:path.join(out,'home-motion-1440-light.png')});
    await context.close();
    const fallback=await browser.newPage({viewport:{width:390,height:844}});
    fallback.on('pageerror',e=>pageErrors.push(e.message));
    await fallback.addInitScript(()=>{
      localStorage.setItem('pref-theme','light');
      Object.defineProperty(document,'startViewTransition',{value:undefined,configurable:true});
    });
    await fallback.goto(base+'/',{waitUntil:'domcontentloaded'});
    await fallback.waitForSelector('html.bd-ready');
    await fallback.locator('#theme-toggle').click();
    assert.equal(await fallback.evaluate(()=>document.documentElement.dataset.theme),'dark','Theme fallback did not change the theme');
    assert(!(await fallback.locator('html').evaluate(e=>e.classList.contains('bd-theme-reveal'))));
    await fallback.close();
    assert.deepEqual(pageErrors,[],'Browser JavaScript errors');
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify({results,coldLoads,noJSArticle,interactionPaths:true,boundedMotion:true,themeReveal:true,themeFallback:true,unreadableNavRejected:true,pageErrors},null,2));
    console.log(`PASS: ${results.length} page/viewport/theme checks; cold-load CLS, no-JS homepage, TOC, share, Works tabs, search and unreadable-nav control.`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
