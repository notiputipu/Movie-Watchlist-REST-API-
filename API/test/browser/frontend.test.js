import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { chromium, expect } from '@playwright/test';
import { createTestDatabase } from '../helpers/database.js';
import { startFrontendServer } from '../helpers/frontend.js';
import { applySchema } from '../../src/database/setup.js';
import { seedDatabase } from '../../src/database/seed.js';

let database;
let frontend;
let apiServer;
let apiOrigin;
let pool;
let browser;

before(async () => {
    database = await createTestDatabase();
    process.env.DB_NAME = database.name;
    await applySchema(database.connection);
    await seedDatabase(database.connection);
    frontend = await startFrontendServer();
    process.env.CORS_ORIGINS = frontend.origin;
    ({ pool } = await import('../../src/database/connection.js'));
    const { app } = await import('../../src/app.js');
    apiServer = app.listen(0, '127.0.0.1');
    await once(apiServer, 'listening');
    apiOrigin = `http://127.0.0.1:${apiServer.address().port}`;
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
});

after(async () => {
    if (browser) await browser.close();
    for (const server of [apiServer, frontend?.server]) {
        if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    }
    if (pool) await pool.end();
    if (database) await database.dispose();
});

async function openPage(t, account, sameOrigin = false) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    t.after(() => context.close());
    await context.addInitScript(({ api, account, sameOrigin }) => {
        if (!sameOrigin) localStorage.setItem('filmlog_api_url', api + '/api');
        if (account) {
            localStorage.setItem('filmlog_token', account.token);
            localStorage.setItem('filmlog_user', JSON.stringify(account.user));
        }
        window.__xss = 0;
    }, { api: apiOrigin, account, sameOrigin });
    // Keep functional/security tests independent of third-party CSS/icon/image availability.
    await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === frontend.origin || url.origin === apiOrigin) return route.continue();
        if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'text/javascript',
            body: "globalThis.tailwind={config:{}};const style=document.createElement('style');style.textContent='.hidden{display:none!important}';document.head.append(style);" });
        if (url.hostname === 'unpkg.com') return route.fulfill({ contentType: 'text/javascript', body: 'globalThis.lucide={createIcons(){}};' });
        return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, [], 'Frontend should not throw JavaScript errors'));
    page.setDefaultTimeout(7000);
    await page.goto(sameOrigin ? apiOrigin + '/' : frontend.origin + '/frontend/index.html');
    await page.waitForFunction(() => state.allMovies.length === 20);
    return page;
}

test('browser completes register → login → discover → watchlist → watched → logout using real MySQL', { timeout: 30000 }, async (t) => {
    const page = await openPage(t, undefined, true);
    assert.equal(await page.evaluate(() => state.apiBaseUrl), apiOrigin + '/api');
    assert.equal(await page.evaluate(() => localStorage.getItem('filmlog_api_url')), null);
    await expect(page.locator('#movie-grid .poster-hover')).toHaveCount(20);
    await page.locator('#auth-container').getByRole('button', { name: 'Register', exact: true }).click();
    await page.locator('#auth-username').fill('browser_user');
    await page.locator('#auth-email').fill('browser@example.com');
    await page.locator('#auth-password').fill('browser test password');
    await page.locator('#auth-submit-btn').click();
    await page.waitForFunction(() => state.authMode === 'login' && state.logs.some((log) => log.url.endsWith('/auth/register') && log.status === 201));
    await page.locator('#auth-submit-btn').click();
    await page.waitForFunction(() => state.token && state.user?.username === 'browser_user');
    const firstMovie = page.locator('#movie-grid .poster-hover').first();
    await firstMovie.getByRole('button', { name: 'Add Watchlist', exact: true }).click();
    await page.waitForFunction(() => state.watchlist.some((entry) => entry.movie_id === 1));
    await firstMovie.getByRole('button', { name: 'Mark Watched', exact: true }).click();
    await page.locator('#watched-review-input').fill('A browser-tested viewing');
    await page.locator('#modal-detail-content .star-btn').nth(3).click();
    await page.locator('#modal-detail-content').getByRole('button', { name: 'Simpan Catatan' }).click();
    await page.waitForFunction(() => state.watchedList.length === 1 && !state.watchlist.some((entry) => entry.movie_id === 1));
    await expect(page.locator('#movie-grid .poster-hover').first().getByRole('button', { name: 'Add Watchlist', exact: true })).toHaveCount(1);
    await page.locator('.mobile-nav-btn').getByText('Watched', { exact: true }).click();
    await expect(page.locator('#watched-list')).toContainText('A browser-tested viewing');
    const [[row]] = await pool.query(`SELECT r.rating FROM reviews r JOIN users u ON u.id = r.user_id WHERE u.email = 'browser@example.com'`);
    assert.equal(row.rating, 4);
    await page.locator('#auth-container button[title="Logout"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('filmlog_token')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('filmlog_user')), null);
});

test('browser renders hostile user, movie, review, log, and AI text without executing or leaking its token', { timeout: 30000 }, async (t) => {
    const username = '<svg onload=window.__xss=1>';
    const malicious = `<img src=x onerror="window.__xss=1;fetch('/__leak?t='+localStorage.getItem('filmlog_token'))"> & < > " '`;
    const password = 'browser security password';
    async function post(path, body, token) {
        const response = await fetch(apiOrigin + path, { method: 'POST', headers: {
            'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }, body: JSON.stringify(body) });
        assert.ok(response.ok);
        return (await response.json()).data;
    }
    await post('/api/auth/register', { username, email: 'xss@example.com', password });
    const account = await post('/api/auth/login', { email: 'xss@example.com', password });
    await post('/api/watched', { movieId: 1, rating: 5, review: malicious }, account.token);
    await post('/api/watchlist', { movieId: 1 }, account.token);
    await pool.execute('UPDATE movies SET title = ?, director = ?, synopsis = ?, poster_url = ?, genres = ?, cast_members = ? WHERE id = 1',
        [malicious, malicious, malicious, 'javascript:window.__xss=1', JSON.stringify([malicious]), JSON.stringify([malicious])]);
    try {
        const page = await openPage(t, account);
        const leaks = [];
        page.on('request', (request) => { if (request.url().includes('/__leak')) leaks.push(request.url()); });
        await expect(page.locator('#auth-container')).toContainText(username);
        await page.evaluate(() => switchTab('watched'));
        await expect(page.locator('#watched-list')).toContainText(malicious);
        await page.evaluate(() => switchTab('watchlist'));
        await expect(page.locator('#watchlist-grid')).toContainText(malicious);
        await page.evaluate(() => openMovieDetail(1));
        await expect(page.locator('#modal-detail-content')).toContainText(malicious);
        await page.evaluate(() => { closeMovieDetailModal(); switchTab('ai'); });
        await page.route(apiOrigin + '/api/movies/recommend', (route) => route.fulfill({ contentType: 'application/json',
            body: JSON.stringify({ success: true, data: { movie_id: 1, reasoning: malicious }, error: null }) }));
        await page.locator('#ai-prompt-input').fill('sci-fi');
        await page.locator('#btn-submit-ai').click();
        await expect(page.locator('#ai-result-container')).toContainText(malicious);
        await page.evaluate((text) => {
            logApiRequest({ method: text, url: text, ok: false, status: text, duration: 1, time: text });
            showToast(text, 'error');
        }, malicious);
        await expect(page.locator('#logs-content')).toContainText(malicious);
        await expect(page.locator('#toast-message')).toHaveText(malicious);
        assert.equal(await page.evaluate(() => window.__xss), 0);
        assert.deepEqual(leaks, []);
        assert.equal(await page.locator('[src^="javascript:"]').count(), 0);
        assert.equal(await page.locator('[onload*="__xss"], [onerror*="__xss"]').count(), 0);
        assert.equal(await page.evaluate(() => localStorage.getItem('filmlog_token')), account.token);
    } finally { await seedDatabase(database.connection); }
});
