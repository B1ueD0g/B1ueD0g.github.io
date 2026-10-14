// Serve a fresh Hugo output first. Google navigations are fulfilled locally.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const { chromium } = require(option('--playwright-module', 'playwright'));
const base = option('--base-url', 'http://127.0.0.1:8767');
const out = option('--output-dir', '/tmp/bluedog-language-switch');
const source = path.join(__dirname, '..');
const routes = ['/', '/research/', '/posts/archive/技术好文/digital-government-integrated-security/'];
const origin = 'https://bluedog.website';
const checkTranslation = (href, language, expectedPage) => {
  const url = new URL(href);
  assert.equal(url.origin, 'https://translate.google.com');
  assert.equal(url.pathname, '/translate');
  assert.equal(url.searchParams.get('sl'), 'zh-CN');
  assert.equal(url.searchParams.get('tl'), language);
  assert.equal(url.searchParams.get('u'), expectedPage);
};
const insideViewport = (rect, width, label) => {
  assert(rect && rect.x >= -1 && rect.x + rect.width <= width + 1, `${label} exceeds viewport: ${JSON.stringify(rect)}`);
};

(async () => {
  await fs.mkdir(out, { recursive: true });
  const css = await fs.readFile(path.join(source, 'assets/css/extended/language-switch.css'));
  const cssGzip = zlib.gzipSync(css, { level: 9 }).length;
  assert(cssGzip <= 600, `Language CSS exceeds its 600-byte gzip budget: ${cssGzip}`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  const errors = [];
  let googleRequests = 0;
  let bundleGzip = 0;
  let languageMarkup;
  const intercept = async context => {
    await context.route('https://**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === 'https://translate.google.com') {
        googleRequests++;
        return route.fulfill({ contentType: 'text/html', body: '<title>Intercepted translation navigation</title>' });
      }
      return route.abort();
    });
  };
  try {
    for (const width of [1440, 390]) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
        await intercept(context);
        await context.addInitScript(value => localStorage.setItem('pref-theme', value), theme);
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        for (let index = 0; index < routes.length; index++) {
          const response = await page.goto(base + routes[index], { waitUntil: 'domcontentloaded' });
          assert.equal(response.status(), 200);
          await page.evaluate(() => document.fonts.ready);
          const summary = page.locator('#language-switch > summary');
          const root = page.locator('#language-switch');
          assert.equal(await root.getAttribute('translate'), 'no');
          assert((await root.getAttribute('class')).split(/\s+/).includes('notranslate'));
          const canonical = await root.getAttribute('data-language-canonical');
          assert.equal(new URL(canonical).origin, origin);
          assert.equal(new URL(canonical).pathname, new URL(routes[index], origin).pathname);
          assert.equal(await page.locator('link[rel="alternate"][hreflang="en"],link[rel="alternate"][hreflang="de"]').count(), 0);
          const trigger = await summary.boundingBox();
          insideViewport(trigger, width, 'Language trigger');
          assert(trigger.width >= 44 && trigger.height >= 44, 'Language trigger is smaller than 44px');
          const themeBox = await page.locator('#theme-toggle').boundingBox();
          assert(themeBox.x + themeBox.width <= trigger.x + 1, 'Theme and language controls overlap');
          assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
          assert.equal(await root.evaluate(e => e.open), false);
          const before = googleRequests;
          await summary.focus();
          await summary.press('Enter');
          assert(await root.evaluate(e => e.open), 'Native summary Enter did not open languages');
          const panel = page.locator('.language-panel');
          insideViewport(await panel.boundingBox(), width, 'Language popover');
          assert(await panel.evaluate(e => {
            const r = e.getBoundingClientRect();
            return e.contains(document.elementFromPoint(r.x + r.width / 2, r.bottom - 8));
          }), `Popover clipped/covered at ${width} ${theme} ${routes[index]}`);
          assert(await panel.locator('p,a').evaluateAll(es => es.every(e => {
            const r = e.getBoundingClientRect();
            return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
          })), `Popover content is covered by the header navigation at ${width} ${theme}`);
          assert((await panel.textContent()).includes('整页自动翻译 · Google Translate'));
          assert((await panel.textContent()).includes('中文原页会保留'));
          const links = root.locator('a');
          for (let linkIndex = 0; linkIndex < 3; linkIndex++) {
            const box = await links.nth(linkIndex).boundingBox();
            assert(box.height >= 44, 'Language link target is smaller than 44px');
          }
          await page.keyboard.press('Tab');
          assert(await root.locator('[data-language-original]').evaluate(e => e === document.activeElement), 'Native Tab did not reach original page');
          await page.keyboard.press('Tab');
          assert(await root.locator('[data-language-target="en"]').evaluate(e => e === document.activeElement));
          await page.keyboard.press('Escape');
          assert(!(await root.evaluate(e => e.open)));
          assert(await summary.evaluate(e => e === document.activeElement), 'Escape did not restore globe focus');
          assert.equal(googleRequests, before, 'Opening the menu contacted Google before a link was clicked');
          if (!languageMarkup) {
            languageMarkup = await root.evaluate(e => e.outerHTML);
            const stylesheet = page.locator('link[rel~="stylesheet"]');
            assert.equal(await stylesheet.count(), 1, 'Language CSS created an extra stylesheet');
            const stylesheetResponse = await context.request.get(new URL(await stylesheet.first().getAttribute('href'), base).href);
            assert(stylesheetResponse.ok());
            // Match check_generated_site.py's gzip.compress default (level 9).
            bundleGzip = zlib.gzipSync(await stylesheetResponse.body(), { level: 9 }).length;
            assert(bundleGzip <= 70000, `Production stylesheet exceeds gzip gate: ${bundleGzip}`);
          }
          await summary.press('Space');
          assert(await root.evaluate(e => e.open), 'Native Space did not open languages');
          await page.screenshot({ path: path.join(out, `${index}-${width}-${theme}.png`) });
          await page.locator('#theme-toggle').click();
          assert(!(await root.evaluate(e => e.open)), 'Clicking outside did not close languages');
          assert(await page.locator('#theme-toggle').evaluate(e => e === document.activeElement), 'Outside click stole the clicked control focus');
          await page.locator('#theme-toggle').click();
          results.push({ route: routes[index], width, theme, trigger, canonical });
        }
        await context.close();
      }
    }

    // Static links and native disclosure remain usable with JavaScript disabled.
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await intercept(noJs);
    const staticPage = await noJs.newPage();
    await staticPage.goto(base + '/research/', { waitUntil: 'domcontentloaded' });
    await staticPage.locator('#language-switch > summary').click();
    for (const language of ['en', 'de']) {
      const link = staticPage.locator(`[data-language-target="${language}"]`);
      assert(await link.isVisible());
      checkTranslation(await link.getAttribute('href'), language, origin + '/research/');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert((await link.getAttribute('rel')).includes('noopener'));
    }
    assert.equal(await staticPage.locator('[data-language-original]').getAttribute('href'), origin + '/research/');
    await staticPage.goto(base + '/posts/archive/技术好文/openclaw-raspberrypi-deployment/', { waitUntil: 'domcontentloaded' });
    assert((await staticPage.locator('pre').count()) > 0, 'No server-rendered code blocks found');
    assert(await staticPage.locator('pre').evaluateAll(es => es.every(e => e.getAttribute('translate') === 'no')), 'Server-rendered code is missing translate=no without JS');
    await noJs.close();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await intercept(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const query = '?q=SDN%20%E6%8B%93%E6%89%91&tag=zero%2Btrust&_x_tr_sl=zh-CN&_x_tr_tl=en';
    await page.goto(base + '/research/' + query + '#research-papers', { waitUntil: 'domcontentloaded' });
    const expected = origin + '/research/?q=SDN%20%E6%8B%93%E6%89%91&tag=zero%2Btrust#research-papers';
    await page.locator('#language-switch > summary').click();
    assert.equal(await page.locator('[data-language-original]').getAttribute('href'), expected);
    for (const language of ['en', 'de']) {
      const link = page.locator(`[data-language-target="${language}"]`);
      checkTranslation(await link.getAttribute('href'), language, expected);
      if (!(await page.locator('#language-switch').evaluate(e => e.open))) await page.locator('#language-switch > summary').click();
      const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
      await popup.waitForLoadState('domcontentloaded');
      checkTranslation(popup.url(), language, expected);
      assert.equal(page.url(), base + '/research/' + query + '#research-papers', 'Translation replaced the Chinese tab');
      await popup.close();
      assert(await page.locator('#language-switch > summary').evaluate(e => e === document.activeElement), 'Returning from translation lost globe focus');
    }

    // A copied proxy page must still link to the server-rendered public origin.
    const script = await fs.readFile(path.join(source, 'assets/js/language-switch.js'), 'utf8');
    await context.route('https://bluedog-website.translate.goog/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8">' + languageMarkup + '<pre>let x = 1</pre><code>--flag</code><kbd>Tab</kbd><samp>OK</samp><span class="katex">x²</span><span class="MathJax">y²</span>' }));
    const proxy = await context.newPage();
    proxy.on('pageerror', error => errors.push(error.message));
    await proxy.goto('https://bluedog-website.translate.goog/?q=Agent%20Security&_x_tr_sl=zh-CN&_x_tr_tl=de#read');
    const technicalText = await proxy.locator('pre,code,kbd,samp,.katex,.MathJax').allTextContents();
    await proxy.addScriptTag({ content: script });
    checkTranslation(await proxy.locator('[data-language-target="de"]').getAttribute('href'), 'de', origin + '/?q=Agent%20Security#read');
    assert.equal(await proxy.locator('[data-language-original]').getAttribute('href'), origin + '/?q=Agent%20Security#read');
    assert.deepEqual(await proxy.locator('pre,code,kbd,samp,.katex,.MathJax').allTextContents(), technicalText);
    assert(await proxy.locator('pre,code,kbd,samp,.katex,.MathJax').evaluateAll(es => es.every(e => e.getAttribute('translate') === 'no' && e.classList.contains('notranslate'))));
    const rejected = await proxy.evaluate(() => {
      const root = document.querySelector('[data-language-switch]');
      const link = root.querySelector('[data-language-target="en"]');
      const canonical = root.dataset.languageCanonical;
      root.dataset.languageCanonical = 'https://foreign.example/polluted/';
      const foreign = !link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      root.dataset.languageCanonical = canonical;
      link.dataset.languageTarget = 'fr';
      const unsupported = !link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return { foreign, unsupported, hrefRemoved: !link.hasAttribute('href') };
    });
    assert.deepEqual(rejected, { foreign: true, unsupported: true, hrefRemoved: true });
    await context.close();
    assert.deepEqual(errors, [], 'Browser JavaScript errors');
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ results, cssGzip, bundleGzip, googleRequests, noJs: true, queryHash: true, proxyOriginRejected: true, technicalTextProtected: true, negativeControls: rejected, errors }, null, 2));
    console.log(`PASS: ${results.length} page/viewport/theme cases; 44px trigger bounds; native keyboard/Escape/outside click; no-JS links; query/hash; proxy-safe origin; Google navigation interception; technical text; foreign-origin/unsupported-language controls. CSS ${cssGzip}B gzip, bundle ${bundleGzip}B gzip.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
