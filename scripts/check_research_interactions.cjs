// Observe startup layout reads and exercise the real Works controls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const option = (name, fallback) => { const at=process.argv.indexOf(name); return at<0?fallback:process.argv[at+1]; };
const {chromium} = require(option('--playwright-module','playwright'));
const base = option('--base-url','http://127.0.0.1:8767');
const output = option('--output-dir','/tmp/bluedog-research');
async function observe(browser,url,width,theme) {
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme});
  try {
    const page=await context.newPage();
    await page.addInitScript(()=>{
      localStorage.setItem('pref-theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
      window.__worksGeometry=[];
      const rect=Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect=function(...args){
        if(this.matches?.('.about-work-panels,.about-work-panel'))window.__worksGeometry.push('rect');
        return rect.apply(this,args);
      };
      const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetWidth');
      Object.defineProperty(HTMLElement.prototype,'offsetWidth',{...descriptor,get(){
        if(this.matches?.('.about-work-panels,.about-work-panel'))window.__worksGeometry.push('offsetWidth');
        return descriptor.get.call(this);
      }});
    });
    await page.goto(url,{waitUntil:'networkidle'});
    const initial=await page.evaluate(()=>window.__worksGeometry.length);
    const tabs=page.locator('.about-work-tab'), selected=page.locator('.about-work-tab[aria-selected="true"]');
    assert.equal(await selected.getAttribute('data-target'),'published');
    await tabs.nth(1).click();await page.waitForTimeout(400);
    assert.equal(await selected.getAttribute('data-target'),'inprogress');
    assert.equal(await page.locator('.about-work-panel:not([hidden])').getAttribute('data-panel'),'inprogress');
    await tabs.nth(1).focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(400);
    assert.equal(await selected.getAttribute('data-target'),'translated');
    assert.equal(await page.locator('.about-work-tab:focus').getAttribute('data-target'),'translated');
    await page.keyboard.press('Home');await page.waitForTimeout(400);
    assert.equal(await selected.getAttribute('data-target'),'published');
    assert.equal(await page.locator('.about-work-tab:focus').getAttribute('data-target'),'published');
    assert.equal(await page.locator('.about-work-panel[aria-hidden="false"]').count(),1);
    assert.equal(await page.locator('.about-work-panels').evaluate(e=>e.style.height),'');
    assert((await page.evaluate(()=>window.__worksGeometry.length))>initial,'Instrumentation missed actual tab transitions');
    return {width,theme,initialReads:initial,realTransitions:true};
  } finally {await context.close();}
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const results=[];
    for(const width of [1440,390])for(const theme of ['light','dark']){
      const result=await observe(browser,base+'/research/',width,theme);
      assert.equal(result.initialReads,0,'Server-rendered Works panel was needlessly measured at startup');results.push(result);
    }
    const baseline=option('--baseline-url',null);
    if(baseline){const old=await observe(browser,baseline+'/research/',390,'light');assert(old.initialReads>0,'Old implementation must fail the startup-layout check');}
    const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    const page=await context.newPage();await page.goto(base+'/research/');
    assert.equal(await page.locator('.about-work-panel:not([hidden])').getAttribute('data-panel'),'published');
    assert((await page.locator('#research-papers a[href]').count())>0);
    assert.equal(await page.locator('[data-social-icon=linkedin]').count(),0,'Unverified social entry is still published');
    assert.equal(await page.locator('.social-icons a').count(),5);
    await page.goto(base+'/about/');
    const structured=await page.locator('script[type="application/ld+json"]').allTextContents();
    assert(structured.some(text=>text.includes('"sameAs"')),'Profile identity data was not exercised');
    assert(!structured.some(text=>text.includes('linkedin.com/in/b1ued0g')),'Disabled entry leaked into structured data');
    await page.goto(base+'/research/');
    assert.equal(await page.locator('a[href="https://www.cqvip.com/journal/71313X/71313X/2025"]').count(),1);
    await context.close();
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,baselineRejected:!!baseline,noJS:true,socialPolicy:true},null,2));
    console.log('PASS: Research zero startup panel reads, real keyboard/click transitions, four layouts, no-JS and link policy.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
