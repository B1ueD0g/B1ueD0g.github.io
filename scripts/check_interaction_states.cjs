// Deterministic state tests for the production functions, without a browser or dependencies.
// This DOM fixture checks keyboard state and async ownership; layout still needs browser QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

class Element {
  constructor(tag, document, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.textContent = '';
    this.value = '';
    this.innerHTML = '';
    this.classList = {
      contains: name => this.classes.has(name),
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, force) => {
        const add = force === undefined ? !this.classes.has(name) : force;
        if (add) this.classes.add(name); else this.classes.delete(name);
        return add;
      }
    };
    this.classes = new Set();
    Object.entries(attrs).forEach(([name, value]) => this.setAttribute(name, value));
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { this.toggleAttribute('hidden', value); }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  get tabIndex() {
    return this.hasAttribute('tabindex') ? Number(this.getAttribute('tabindex')) : /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(this.tagName) ? 0 : -1;
  }
  set tabIndex(value) { this.setAttribute('tabindex', String(value)); }
  get href() { return this.getAttribute('href') || ''; }
  setAttribute(name, value) {
    if (name === 'class') this.className = value;
    else if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    else this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    if (name === 'class') return this.className;
    if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    else this.attributes.delete(name);
  }
  toggleAttribute(name, force) { if (force) this.setAttribute(name, ''); else this.removeAttribute(name); }
  appendChild(element) { this.children.push(element); element.parentElement = this; return element; }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, properties = {}) {
    const event = {
      target: this, key: '', shiftKey: false, bubbles: true, cancelBubble: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.cancelBubble = true; },
      ...properties
    };
    // Keyboard target stays fixed while synchronous handlers may change activeElement.
    let current = this;
    while (current) {
      event.currentTarget = current;
      (current.listeners[type] || []).forEach(fn => fn(event));
      if (!event.bubbles || event.cancelBubble) return event;
      current = current.parentElement;
    }
    if (this.isConnected) this.ownerDocument.dispatch(type, event);
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
  getClientRects() { return this.closest('[hidden]') || this.style.display === 'none' ? [] : [{}]; }
  closest(selector) {
    let element = this;
    while (element) { if (matches(element, selector)) return element; element = element.parentElement; }
    return null;
  }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap(child => [child, ...child.descendants()]);
    return descendants.filter(element => matches(element, selector));
  }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function matches(element, selectors) {
  return selectors.split(',').some(selector => {
    const parts = selector.trim().split(/\s+/);
    let current = element;
    if (!simpleMatch(current, parts.pop())) return false;
    while (parts.length) {
      const part = parts.pop();
      current = current.parentElement;
      while (current && !simpleMatch(current, part)) current = current.parentElement;
      if (!current) return false;
    }
    return true;
  });
}
function simpleMatch(element, selector) {
  if (!element) return false;
  let allowed = true;
  selector = selector.replace(/:not\(([^)]+)\)/g, (_, excluded) => { if (simpleMatch(element, excluded)) allowed = false; return ''; });
  if (!allowed) return false;
  const tag = selector.match(/^[a-z]+/i);
  if (tag && element.tagName !== tag[0].toUpperCase()) return false;
  const id = selector.match(/#([\w-]+)/);
  if (id && element.id !== id[1]) return false;
  if ([...selector.matchAll(/\.([\w-]+)/g)].some(match => !element.classList.contains(match[1]))) return false;
  return [...selector.matchAll(/\[([^\]=^]+)(\^?=)?['"]?([^'"\]]*)['"]?\]/g)].every(([, name, operator, value]) => {
    const actual = element.getAttribute(name);
    return operator === '=' ? actual === value : operator === '^=' ? actual !== null && actual.startsWith(value) : actual !== null;
  });
}
function fixture() {
  const document = { listeners: {}, activeElement: null, title: 'Fixture' };
  document.body = new Element('body', document);
  document.documentElement = new Element('html', document);
  document.activeElement = document.body;
  document.querySelector = selector => document.body.querySelector(selector);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag, document);
  document.addEventListener = (type, fn) => (document.listeners[type] ||= []).push(fn);
  document.dispatch = (type, properties) => {
    const event = { target: document.activeElement, preventDefault() { this.defaultPrevented = true; }, ...properties };
    (document.listeners[type] || []).forEach(fn => fn(event));
    return event;
  };
  const frameQueue = [];
  const window = {
    location: { origin: 'https://fixture.test', href: 'https://fixture.test/article/', pathname: '/search/', search: '' },
    history: { replaceState() {} },
    requestAnimationFrame: fn => frameQueue.push(fn),
    getComputedStyle: element => ({ display: element.style.display || 'block', visibility: element.style.visibility || 'visible' }),
    matchMedia: () => ({ matches: false }),
    setTimeout, clearTimeout
  };
  const context = vm.createContext({ document, window, navigator: { userAgent: 'fixture' }, URL, URLSearchParams, CSS: { escape: value => value }, console, Promise });
  const add = (parent, tag, attrs) => parent.appendChild(new Element(tag, document, attrs));
  return { document, window, context, add, frameQueue };
}

function checkToc(source) {
  const f = fixture();
  const { document, window, add } = f;
  const media = { matches: true, addEventListener(type, fn) { this.change = fn; } };
  window.matchMedia = () => media;
  const rail = add(document.body, 'aside', { class: 'editorial-toc-rail' });
  const toggle = add(rail, 'button', { class: 'editorial-toc-toggle' });
  const body = add(rail, 'div', { class: 'editorial-toc-rail-body' });
  const toc = add(body, 'div', { class: 'toc' });
  const details = add(toc, 'details');
  const summary = add(details, 'summary');
  const first = add(details, 'a', { href: '#first' });
  const current = add(details, 'a', { href: '#current', 'aria-current': 'location', tabindex: '0' });
  const start = source.indexOf('    function setupEditorialTocRail()');
  const end = source.indexOf('    function setupAboutSectionNav()', start);
  assert(start > 0 && end > start, 'Production TOC function not found');
  vm.runInContext('(' + source.slice(start, end).trim() + ')()', f.context);
  assert(body.hasAttribute('inert'), 'Closed desktop TOC is not inert');
  assert.equal(first.tabIndex, -1, 'Closed desktop link is still in Tab order');
  toggle.focus();
  toggle.dispatch('click');
  assert.equal(document.activeElement, current, 'Opening TOC must focus current section');
  assert(!body.hasAttribute('inert'));
  assert.equal(first.getAttribute('tabindex'), null, 'Original absent tabindex was not restored');
  assert.equal(current.getAttribute('tabindex'), '0', 'Original explicit tabindex was not restored');
  document.dispatch('keydown', { key: 'Escape' });
  assert.equal(document.activeElement, toggle, 'Escape must restore TOC toggle focus');
  toggle.dispatch('click');
  media.matches = false; media.change();
  assert(!body.hasAttribute('inert'), 'Mobile native details must not remain inert');
  assert.equal(details.open, false);
  assert.equal(document.activeElement, summary, 'Desktop-to-mobile focus must move to native summary');
  media.matches = true; media.change();
  assert.equal(document.activeElement, toggle, 'Mobile-to-desktop focus must move to drawer toggle');
  toggle.dispatch('click');
  document.querySelector('.editorial-toc-backdrop').dispatch('click');
  assert.equal(document.activeElement, toggle, 'Backdrop close must restore toggle focus');
  assert(body.hasAttribute('inert'));
}

function checkShare(source) {
  const f = fixture();
  const { document, add } = f;
  const root = add(document.body, 'div', { class: 'bd-share', 'data-share-root': '', 'data-share-title': 'Fixture', 'data-share-url': '/article/' });
  const trigger = add(root, 'button', { 'data-share-open': '' });
  const sheet = add(root, 'div', { 'data-share-sheet': '', hidden: '', 'aria-hidden': 'true' });
  const panel = add(sheet, 'section', { class: 'bd-share-panel', tabindex: '-1' });
  const close = add(panel, 'button', { 'data-share-close': '' });
  const options = add(panel, 'div', { 'data-share-options': '' });
  const wechat = add(options, 'button', { 'data-share-action': 'wechat' });
  add(options, 'button', { 'data-share-action': 'x' });
  const copy = add(options, 'button', { 'data-share-action': 'copy' });
  const view = add(panel, 'div', { 'data-share-wechat': '', hidden: '' });
  const back = add(view, 'button', { 'data-share-wechat-back': '' });
  const wechatCopy = add(view, 'button', { 'data-share-action': 'copy-wechat' });
  const click = target => document.dispatch('click', { target });
  const tab = shiftKey => document.dispatch('keydown', { key: 'Tab', shiftKey });
  vm.runInContext(source, f.context);
  trigger.focus(); click(trigger);
  assert.equal(document.activeElement, close);
  tab(true);
  assert.equal(document.activeElement, copy, 'Hidden WeChat descendants entered the default focus loop');
  // Emulate pointer clicks that do not move focus onto the clicked button.
  close.focus(); click(wechat);
  assert.equal(document.activeElement, back);
  wechatCopy.focus(); tab(false);
  assert.equal(document.activeElement, close, 'WeChat focus loop did not wrap');
  close.focus(); tab(true);
  assert.equal(document.activeElement, wechatCopy, 'Hidden share-option descendants entered WeChat focus loop');
  click(back);
  assert.equal(document.activeElement, wechat, 'WeChat return did not restore the originating option');
  document.body.focus(); tab(false);
  assert.equal(document.activeElement, close, 'Focus lost from the modal did not return to its visible controls');
  document.dispatch('keydown', { key: 'Escape' });
  assert.equal(document.activeElement, trigger);
  document.body.focus(); document.dispatch('keydown', { key: 'Escape' });
  assert.equal(document.activeElement, document.body, 'Closed share sheet stole focus on Escape');
}

function checkSearchNavigation(source) {
  const f = fixture();
  const { document, window, add } = f;
  add(document.body, 'div', { 'data-search-app': '' });
  const config = add(document.body, 'script', { id: 'search-config' }); config.textContent = '{}';
  const input = add(document.body, 'input', { id: 'search-query-input' });
  const results = add(document.body, 'div', { id: 'search-results', class: 'search-results', 'data-prerendered': 'true' });
  add(document.body, 'div', { id: 'search-results-count' });
  const scrolls = [];
  const links = [];
  const cards = [0, 1].map(index => {
    const card = add(results, 'article', { class: 'search-result-card', 'data-result-index': String(index) });
    const heading = add(card, 'h2', { class: 'search-result-title' });
    links.push(add(heading, 'a', { href: '/post-' + index + '/' }));
    card.scrollIntoView = options => scrolls.push({ index, ...options });
    return card;
  });
  const ending = /  buildSynonymLookup\(\);\n  initFromURL\(\);\n  renderRecentSearches\(\);\n  bindEvents\(\);\n  performSearch\(\);/;
  assert(ending.test(source), 'Production search initialization not found');
  vm.runInContext(source.replace(ending, '  window.__interactionTest = { render: renderResults, bind: bindEvents };'), f.context);
  input.focus();
  // Hydrate real prerendered cards through the production initial rendering path.
  window.__interactionTest.render({ total: 2, items: links.map(link => ({ record: { url: link.href } })) }, { raw: '', primaryTerms: [] });
  assert.equal(scrolls.length, 0, 'Initial result hydration scrolled the page');
  assert.equal(document.activeElement, input, 'Initial result hydration stole focus');
  window.__interactionTest.bind();
  cards[1].dispatch('pointerover');
  assert(cards[1].classList.contains('is-active'), 'Hover did not update the active card');
  assert.equal(scrolls.length, 0, 'Pointer hover scrolled the page');
  assert.equal(document.activeElement, input, 'Pointer hover stole focus');
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, links[0], 'Keyboard navigation did not focus the first result');
  assert.equal(scrolls.length, 1, 'Keyboard navigation did not scroll the first result into view');
  links[0].dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(document.activeElement, links[1], 'Keyboard navigation did not focus the next result');
  assert.equal(scrolls.length, 2);
  assert.equal(scrolls[1].index, 1);
  assert.equal(scrolls[1].behavior, 'smooth');
  window.matchMedia = () => ({ matches: true });
  links[1].dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(document.activeElement, links[0]);
  assert.equal(scrolls[2].behavior, 'auto', 'Keyboard scroll ignored reduced-motion preference');
}

const tick = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
async function checkSearch(source) {
  const f = fixture();
  const { document, window, add, frameQueue } = f;
  add(document.body, 'div', { 'data-search-app': '' });
  const config = add(document.body, 'script', { id: 'search-config' }); config.textContent = '{}';
  const input = add(document.body, 'input', { id: 'search-query-input' });
  const results = add(document.body, 'div', { id: 'search-results' });
  add(document.body, 'div', { id: 'search-results-count' });
  const ending = /  buildSynonymLookup\(\);\n  initFromURL\(\);\n  renderRecentSearches\(\);\n  bindEvents\(\);\n  performSearch\(\);/;
  assert(ending.test(source), 'Production search initialization not found');
  // Expose the real closure functions in this VM only; production has no test hooks.
  vm.runInContext(source.replace(ending, '  window.__interactionTest = { search: performSearch, engine: function (value) { enginePromise = Promise.resolve(value); } };'), f.context);
  const pending = [];
  window.__interactionTest.engine({ kind: 'pagefind', api: { search() { return new Promise(resolve => pending.push(resolve)); } } });
  const search = value => { input.value = value; return window.__interactionTest.search(); };
  const first = search('first'); await tick();
  const second = search('second'); await tick();
  pending[0]({ results: [] }); await first;
  assert.equal(results.getAttribute('aria-busy'), 'true', 'A stale request cleared current aria-busy');
  assert(results.classList.contains('is-updating'), 'A stale request cleared current update state');
  pending[1]({ results: [] }); await second;
  assert.equal(results.getAttribute('aria-busy'), 'false');
  // A completed request may still have a queued rAF when another request starts.
  const third = search('third'); await tick();
  frameQueue.splice(0).forEach(fn => fn());
  assert(results.classList.contains('is-updating'), 'A stale animation frame cleared the newer request update state');
  pending[2]({ results: [] }); await third;
  frameQueue.splice(0).forEach(fn => fn());
  assert(!results.classList.contains('is-updating'));
}

(async () => {
  const toc = read('assets/js/site-enhance.js');
  const share = read('assets/js/share-sheet.js');
  const search = read('assets/js/archive-search.js');
  checkToc(toc);
  checkShare(share);
  await checkSearch(search);
  checkSearchNavigation(search);
  // Reintroduce the old ownership bug in memory to prove the race checks detect it.
  await assert.rejects(checkSearch(search.replace('if (resultsRoot && serial === requestSerial)', 'if (resultsRoot)')), /stale request cleared current aria-busy/);
  await assert.rejects(checkSearch(search.replace('if (serial === requestSerial) resultsRoot.classList.remove("is-updating");', 'resultsRoot.classList.remove("is-updating");')), /stale animation frame/);
  assert.throws(() => checkShare(share.replace('if (el.tabIndex < 0 || el.closest("[hidden], [inert], [aria-hidden=\'true\']")) return false;', '').replace('el.getClientRects().length > 0', 'true')), /Hidden WeChat descendants/);
  const navigation = /    if \(shouldFocus\) \{\n      if \(link\) link.focus\(\{ preventScroll: true \}\);\n      cards\[activeResultIndex\]\.scrollIntoView\(\{\n        block: "nearest",\n        behavior: window.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth",\n      \}\);\n    \}/;
  assert(navigation.test(search), 'Production keyboard-only scrolling block not found');
  const oldNavigation = search.replace(navigation, `    if (shouldFocus && link) link.focus({ preventScroll: true });
    cards[activeResultIndex].scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });`);
  assert.throws(() => checkSearchNavigation(oldNavigation), /Initial result hydration scrolled the page/);
  assert.throws(() => checkSearchNavigation(search.replace('var target = event.target;', 'var target = active;')),
    /Keyboard navigation did not focus the first result/, 'Bubbled input keydown was handled twice');
  console.log('PASS: TOC keyboard availability and breakpoint focus; visible share focus loops and WeChat return; search request/rAF ownership; initial/hover stability and bubbling keyboard focus/scroll. Five negative controls rejected.');
})().catch(error => { console.error(error); process.exitCode = 1; });
