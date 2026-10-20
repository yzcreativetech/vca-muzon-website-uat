"""Offline browser checks. Requires Python Playwright and locally installed Chrome.
Run from the repository root: python js/test/preachings_browser.py
External requests are intercepted; this never verifies live YouTube playback.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading
import json
import tempfile
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
checks = []
def check(condition, label):
    assert condition, label
    checks.append(label)

def contrast_ratio(foreground, background):
    def luminance(color):
        channels = [int(value) / 255 for value in re.findall(r'\d+', color)[:3]]
        linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in channels]
        return sum(value * weight for value, weight in zip(linear, [.2126, .7152, .0722]))
    low, high = sorted([luminance(foreground), luminance(background)])
    return (high + .05) / (low + .05)

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(reduced_motion='reduce')
        context.route('https://**/*', lambda route: route.fulfill(status=200, content_type='text/html', body='<html><body>Offline player test</body></html>') if 'youtube-nocookie.com/embed/' in route.request.url else route.abort())
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("window.cspErrors=[];document.addEventListener('securitypolicyviolation', e=>window.cspErrors.push(e.violatedDirective))")
        page.goto(base + '/preachings.html')
        page.wait_for_function("() => document.querySelectorAll('.preaching-poster').length === 4")
        check(page.locator('iframe').count() == 0, 'no iframe before interaction; manual duplicate omitted')
        check('manually maintained' in page.locator('#preachings-data-notice').inner_text(), 'manual fallback explicitly labeled')
        for width in [375, 430, 768, 1024, 1440]:
            page.set_viewport_size({'width': width, 'height': 1000})
            check(page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'no horizontal overflow at {width}px')
            box = page.locator('.preaching-player').first.bounding_box()
            check(abs(box['width']/box['height'] - 16/9) < .02, f'16:9 player at {width}px')
            check(page.locator('#latest-preaching').evaluate("e=>getComputedStyle(e).opacity==='1'"), f'reduced-motion content visible at {width}px')
            schedule_colors = page.locator('#sunday-livestream .section-title-left > p').evaluate("e=>({foreground:getComputedStyle(e).color,background:getComputedStyle(e.closest('section')).backgroundColor})")
            ratio = contrast_ratio(schedule_colors['foreground'], schedule_colors['background'])
            check(ratio >= 4.5, f'service schedule contrast at {width}px: {ratio:.2f}:1')
            check(page.locator('.preachings-label').evaluate("e=>getComputedStyle(e).color") == 'rgb(212, 175, 55)', f'existing gold accent preserved at {width}px')
            if width in [375, 430, 768, 1024, 1440]:
                page.screenshot(path=str(Path(tempfile.gettempdir()) / f'vca-preachings-{width}.png'), full_page=True)
        button = page.locator('.preaching-poster').first
        button.focus()
        check(button.evaluate("e=>getComputedStyle(e).outlineStyle!=='none'"), 'visible keyboard focus')
        button.press('Enter')
        page.wait_for_selector('iframe')
        check('youtube-nocookie.com/embed/hwIoKTxWxS4' in page.locator('iframe').get_attribute('src'), 'Enter activates validated privacy embed')
        check(bool(page.locator('iframe').get_attribute('title')), 'iframe has descriptive title')
        page.locator('.preaching-poster').nth(1).click()
        check(page.locator('iframe').count() == 1, 'shared controller replaces active iframe')
        check(page.locator('.preaching-poster').first.is_visible(), 'previous player poster restored')
        page.locator('iframe').dispatch_event('error')
        check('could not load' in page.locator('.preaching-playback-message').nth(1).inner_text(), 'detectable playback error shows fallback')
        check(page.evaluate('window.cspErrors') == [], 'no CSP violation in manual playback')
        for mode, status in [('live','LIVE'),('offline','OFFLINE'),('stale','STALE'),('empty','OFFLINE')]:
            page.goto(base + '/preachings.html?preachings-preview=' + mode)
            page.wait_for_function("() => document.querySelector('#livestream-status').dataset.state === '"+status+"'")
            check('SYNTHETIC TEST ONLY' in page.locator('#preachings-data-notice').inner_text(), f'{mode} preview visibly labeled')
            check(page.locator('iframe').count() == 0, f'{mode} preview loads no iframe')
            check(page.locator('.preaching-poster:not(:disabled)').count() == 0, f'{mode} synthetic playback disabled')
            if mode == 'live': check(page.locator('#livestream-player').is_visible(), 'LIVE displays stream information')
            if mode == 'stale': check(page.locator('#livestream-player').is_hidden(), 'STALE hides historical live player')
            if mode == 'empty': check(page.locator('#preaching-archive-empty').is_visible(), 'empty archive state visible')
        # Explicit DOM rendering tests use intercepted, synthetic media; never published.
        page.evaluate('''async () => {
          const {renderArchive} = await import('./js/preachings-ui.mjs');
          const entries = Array.from({length:17}, (_,i)=>({videoId:'sample'+String(i).padStart(5,'0'),title:i===0?'<img src=x onerror=alert(1)>':'Test '+i,publishedAt:'2026-10-19T00:00:00Z',thumbnailUrl:'https://i.ytimg.com/vi/sample00000/hqdefault.jpg'}));
          renderArchive(entries);
        }''')
        check(page.locator('#preaching-archive-list article').count() == 8, 'first archive page bounded to eight')
        check(page.locator('#latest-preaching-content h3').inner_text() == '<img src=x onerror=alert(1)>', 'untrusted metadata rendered as literal text')
        check(page.locator('#latest-preaching-content h3 img').count() == 0, 'metadata cannot inject HTML')
        page.locator('#preaching-load-more').click()
        check(page.locator('#preaching-archive-list article').count() == 16, 'Load More appends next eight')
        check(page.evaluate("document.activeElement===document.querySelectorAll('#preaching-archive-list article button')[8]"), 'Load More moves focus to newly added card')
        page.locator('#preaching-load-more').click()
        check(page.locator('#preaching-archive-list article').count() == 17 and page.locator('#preaching-load-more').is_hidden(), 'Load More hides after final page')
        page.wait_for_timeout(200)
        check(page.locator('#latest-preaching-content img').first.get_attribute('src').endswith('preaching-hero.webp'), 'missing thumbnail uses local fallback')
        # Regression: discard old count/handler, then restart pagination cleanly.
        transitions = page.evaluate("""async () => {
          const {renderArchive} = await import('./js/preachings-ui.mjs');
          const list = document.querySelector('#preaching-archive-list');
          const more = document.querySelector('#preaching-load-more');
          const count = document.querySelector('#preaching-archive-count');
          const empty = document.querySelector('#preaching-archive-empty');
          const entry = i => ({videoId:'sample'+String(i).padStart(5,'0'),title:'Transition '+i,publishedAt:'2026-10-19T00:00:00Z',thumbnailUrl:'https://example.invalid/test.jpg',watchUrl:'https://www.youtube.com/watch?v=sample'+String(i).padStart(5,'0')});
          const results = [];
          renderArchive([entry(0)], true);
          renderArchive([], true);
          results.push(['non-empty to empty clears result count', count.textContent === '']);
          results.push(['empty archive hides Load More', more.hidden]);
          results.push(['empty archive removes stale pagination handler', more.onclick === null]);
          results.push(['empty archive preserves empty-state message', !empty.hidden && empty.textContent === 'No sermons are available yet.']);
          more.click();
          results.push(['hidden Load More cannot repopulate empty archive', list.children.length === 0 && count.textContent === '']);
          for (let cycle = 0; cycle < 3; cycle++) {
            renderArchive(Array.from({length:17}, (_,i)=>entry(cycle*100+i)), true);
            results.push([`cycle ${cycle}: new archive starts with eight entries`, list.children.length === 8 && count.textContent === 'Showing 8 of 17 messages' && !more.hidden && empty.hidden]);
            more.click();
            results.push([`cycle ${cycle}: one click appends exactly eight entries`, list.children.length === 16 && count.textContent === 'Showing 16 of 17 messages']);
            more.click();
            const titles = [...list.querySelectorAll('h3')].map(e=>e.textContent);
            results.push([`cycle ${cycle}: final page has all current entries once`, titles.length === 17 && new Set(titles).size === 17 && titles.every((title,i)=>title === 'Transition '+(cycle*100+i)) && more.hidden]);
            renderArchive([], true);
            results.push([`cycle ${cycle}: empty reset removes count and handler`, list.children.length === 0 && count.textContent === '' && more.onclick === null && more.hidden]);
            more.click();
            results.push([`cycle ${cycle}: no old pagination callback remains`, list.children.length === 0 && count.textContent === '']);
          }
          return results;
        }""")
        for label, passed in transitions:
            check(passed, label)
        page.evaluate("async () => { const {renderState}=await import('./js/preachings-ui.mjs'); renderState('UNVERIFIED', null); }")
        check('could not be verified' in page.locator('#livestream-status').inner_text(), 'invalid state renders neutral unverified message')
        page.evaluate("async () => { const {archiveState}=await import('./js/preachings-ui.mjs'); archiveState('loading'); }")
        check(page.locator('#preaching-archive-loading').is_visible() and page.locator('#preaching-archive-list').get_attribute('aria-busy') == 'true', 'loading state announces busy archive')
        page.evaluate("""async () => {
          const {connectSnapshot}=await import('./js/preachings-ui.mjs');
          const schema=await (await fetch('data-contracts/schemas/contracts.schema.json')).json();
          const fixture=await (await fetch('data-contracts/fixtures/test-only.json')).json();
          const state=structuredClone(fixture.cases.find(c=>c.name==='active live').payload);
          state.lastSuccessfulCheckAt=new Date().toISOString();
          const generation='generation-12345678-1234-1234-1234-123456789abc';
          const fetcher=async url=>({ok:true,json:async()=>url.endsWith('current.json')?{generation}:url.endsWith('state.json')?state:fixture.cases.find(c=>c.name==='empty archive').payload});
          window.cleanupPreachings=await connectSnapshot({pointerUrl:'/test-only/current.json',schema,maxAgeSeconds:1,fetcher});
        }""")
        check(page.locator('#livestream-status').get_attribute('data-state') == 'LIVE', 'explicit snapshot adapter renders validated fresh LIVE')
        check(page.locator('iframe').count() == 0, 'validated LIVE does not load iframe automatically')
        page.wait_for_function("() => document.querySelector('#livestream-status').dataset.state === 'STALE'")
        check(page.locator('#livestream-player').is_hidden(), 'cached LIVE automatically expires while page remains open')
        page.evaluate('() => window.cleanupPreachings()')
        page.route('**/data-contracts/fixtures/test-only.json' , lambda route: route.fulfill(status=500, body='unavailable'))
        page.goto(base + '/preachings.html?preachings-preview=live')
        page.wait_for_selector('#preaching-archive-error', state='visible')
        check(page.locator('#preaching-archive-loading').is_hidden() and page.locator('#preaching-archive-empty').is_hidden(), 'network error shows only error state')
        check(page.locator('#livestream-status').get_attribute('data-state') == 'UNVERIFIED', 'network failure never asserts OFFLINE')
        check(not errors, 'no browser JavaScript exceptions: '+repr(errors))
        browser.close()
    print(f'PASS: {len(checks)} offline browser assertions across 375, 430, 768, 1024 and 1440px.')
finally:
    server.shutdown()
