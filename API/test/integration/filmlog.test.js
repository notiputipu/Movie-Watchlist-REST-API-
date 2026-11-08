import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestDatabase } from '../helpers/database.js';
import { applySchema } from '../../src/database/setup.js';
import { seedDatabase } from '../../src/database/seed.js';
import { once } from 'node:events';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createGeminiServer } from '../helpers/gemini.js';
import { startApiProcess } from '../helpers/api-process.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

let database;
let pool;
let server;
let base;
let probe;
let probeBase;
let alice;
let bob;
const password = 'correct horse battery';
before(async () => {
    database = await createTestDatabase();
    process.env.DB_NAME = database.name;
    process.env.DB_CONNECTION_LIMIT = '2';
    await applySchema(database.connection);
    await seedDatabase(database.connection);
    ({ pool } = await import('../../src/database/connection.js'));
    const [[selected]] = await pool.query('SELECT DATABASE() AS name');
    assert.equal(selected.name, database.name, 'Application queries must stay in the isolated test database');
    const { app } = await import('../../src/app.js');
    const { requireAuth } = await import('../../src/middleware/auth.js');
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
    const probeApp = express();
    probeApp.get('/private', requireAuth, (req, res) => res.json({ id: req.user.id }));
    probe = probeApp.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    probeBase = `http://127.0.0.1:${probe.address().port}`;
});
after(async () => {
    for (const listener of [server, probe]) {
        if (listener) await new Promise((resolve) => { listener.close(resolve); listener.closeAllConnections(); });
    }
    if (pool) await pool.end();
    if (database) await database.dispose();
});

async function api(path, { method = 'GET', body, token, origin } = {}) {
    const response = await fetch(base + path, {
        method,
        signal: AbortSignal.timeout(5000),
        headers: {
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(origin ? { Origin: origin } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload).sort(), ['data', 'error', 'success']);
    return { status: response.status, payload, response };
}

async function registerAndLogin(username, email) {
    const registration = await api('/api/auth/register', { method: 'POST', body: { username, email, password } });
    assert.equal(registration.status, 201);
    const login = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(login.status, 200);
    return login.payload.data;
}

test('connect to real MySQL and isolate the test database', async () => {
    const [[row]] = await database.connection.query('SELECT DATABASE() AS name, @@session.time_zone AS timezone');
    assert.equal(row.name, database.name);
    assert.equal(row.timezone, '+00:00');
});

test('schema enforces foreign keys, unique values, rating checks, and JSON types', async () => {
    const [result] = await database.connection.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['schema_user', 'schema@example.com', 'x'.repeat(60)],
    );
    const id = result.insertId;
    await assert.rejects(database.connection.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['schema_user', 'other@example.com', 'x'.repeat(60)],
    ), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(database.connection.execute(
        'INSERT INTO reviews (user_id, movie_id, rating, review) VALUES (?, ?, ?, ?)',
        [id, 1, 0, 'Invalid rating'],
    ), { code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await assert.rejects(database.connection.execute(
        'INSERT INTO watchlists (user_id, movie_id) VALUES (?, ?)', [id, 999],
    ), { code: 'ER_NO_REFERENCED_ROW_2' });
    const [[movie]] = await database.connection.execute('SELECT genres, cast_members FROM movies WHERE id = 1');
    assert.ok(Array.isArray(movie.genres));
    assert.ok(Array.isArray(movie.cast_members));
});

test('every pooled connection uses UTC and millisecond dates round-trip correctly', async () => {
    const connections = [await pool.getConnection(), await pool.getConnection()];
    try {
        for (const connection of connections) {
            const [[row]] = await connection.query('SELECT @@session.time_zone AS timezone, CURRENT_TIMESTAMP(3) AS now');
            assert.equal(row.timezone, '+00:00');
            assert.ok(Math.abs(row.now.getTime() - Date.now()) < 5000);
        }
        const [columns] = await connections[0].query("SHOW COLUMNS FROM reviews LIKE 'created_at'");
        assert.equal(columns[0].Type, 'datetime(3)');
    } finally {
        for (const connection of connections) connection.release();
    }
});

test('repeated seeding preserves all 20 IDs, accounts, watchlists, and reviews', async () => {
    const [[user]] = await database.connection.query("SELECT id FROM users WHERE username = 'schema_user'");
    await database.connection.execute('INSERT INTO watchlists (user_id, movie_id) VALUES (?, ?)', [user.id, 1]);
    await database.connection.execute('INSERT INTO reviews (user_id, movie_id, rating, review) VALUES (?, ?, ?, ?)', [user.id, 1, 5, 'Preserve me']);
    await seedDatabase(database.connection);
    await seedDatabase(database.connection);
    const [movies] = await database.connection.query('SELECT id FROM movies ORDER BY id');
    assert.deepEqual(movies.map((movie) => movie.id), Array.from({ length: 20 }, (_, i) => i + 1));
    const [[{ total }]] = await database.connection.query('SELECT COUNT(*) AS total FROM reviews');
    assert.equal(total, 1);
    const [[{ entries }]] = await database.connection.query('SELECT COUNT(*) AS entries FROM watchlists');
    assert.equal(entries, 1);
});

test('setup refuses the legacy schema without modifying its data', async () => {
    const legacy = await createTestDatabase();
    try {
        await legacy.connection.query('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100), email VARCHAR(254))');
        await legacy.connection.execute('INSERT INTO users VALUES (?, ?, ?)', [1, 'Keep me', 'keep@example.com']);
        await assert.rejects(applySchema(legacy.connection), /fresh DB_NAME/);
        const [[row]] = await legacy.connection.query('SELECT name FROM users');
        assert.equal(row.name, 'Keep me');
        const [tables] = await legacy.connection.query('SHOW TABLES');
        assert.equal(tables.length, 1);
    } finally { await legacy.dispose(); }
});

test('registration and login persist a bcrypt hash and return only public user data', async () => {
    alice = await registerAndLogin('alice', 'Alice@example.com');
    bob = await registerAndLogin('bob', 'bob@example.com');
    assert.equal(alice.user.email, 'alice@example.com');
    assert.deepEqual(Object.keys(alice.user).sort(), ['email', 'id', 'username']);
    const [[row]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [alice.user.id]);
    assert.equal(await bcrypt.compare(password, row.password_hash), true);
    assert.match(row.password_hash, /^\$2[aby]\$12\$/);
    const claims = jwt.verify(alice.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    assert.equal(claims.sub, String(alice.user.id));
    assert.equal(claims.exp - claims.iat, 86400);
});

test('concurrent duplicate registrations are resolved by real unique constraints', async () => {
    for (const [left, right] of [
        [{ username: 'race_email_a', email: 'race@example.com' }, { username: 'race_email_b', email: 'race@example.com' }],
        [{ username: 'race_name', email: 'race_name_a@example.com' }, { username: 'race_name', email: 'race_name_b@example.com' }],
    ]) {
        const results = await Promise.all([left, right].map((body) => api('/api/auth/register', {
            method: 'POST', body: { ...body, password },
        })));
        assert.deepEqual(results.map((result) => result.status).sort(), [201, 422]);
    }
});

test('bad credentials have the same message; invalid signup data returns 422', async () => {
    const badPassword = await api('/api/auth/login', { method: 'POST', body: { email: alice.user.email, password: 'incorrect password' } });
    const unknown = await api('/api/auth/login', { method: 'POST', body: { email: 'unknown@example.com', password } });
    assert.equal(badPassword.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(badPassword.payload, unknown.payload);
    for (const body of [
        { username: 'ab', email: 'valid@example.com', password },
        { username: 'valid', email: 'bad', password },
        { username: 'valid', email: 'valid@example.com', password: 'short' },
        { username: 'valid', email: 'valid@example.com', password: '😀'.repeat(19) },
    ]) {
        assert.equal((await api('/api/auth/register', { method: 'POST', body })).status, 422);
    }
});

test('authentication checks token signature, expiry, algorithm, subject, and account existence', async () => {
    const secret = process.env.JWT_SECRET;
    const invalid = [
        'bad.token',
        jwt.sign({}, secret, { subject: String(alice.user.id), expiresIn: -1 }),
        jwt.sign({}, secret, { subject: String(alice.user.id), algorithm: 'HS384' }),
        jwt.sign({}, `${secret}wrong`, { subject: String(alice.user.id) }),
        jwt.sign({}, secret, { subject: '999999' }),
        jwt.sign({}, secret, { subject: '1.5' }),
        jwt.sign({}, secret, { subject: String(alice.user.id) }),
    ];
    assert.equal((await fetch(probeBase + '/private')).status, 401);
    for (const token of invalid) {
        assert.equal((await fetch(probeBase + '/private', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    }
    const valid = await fetch(probeBase + '/private', { headers: { Authorization: `Bearer ${alice.token}` } });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { id: alice.user.id });
});

test('CORS and security headers apply, and practice users routes are gone', async () => {
    const allowed = await api('/api/health', { origin: 'http://localhost:3000' });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(allowed.response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(allowed.response.headers.get('x-frame-options'), 'SAMEORIGIN');
    const blocked = await api('/api/health', { origin: 'https://unlisted.example' });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.response.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(base + '/api/watchlist', { method: 'OPTIONS', headers: {
        Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
    } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    assert.equal((await api('/users')).status, 404);
});

test('movies return all 20 records in frontend-compatible JSON', async () => {
    const result = await api('/api/movies');
    assert.equal(result.status, 200);
    assert.deepEqual(result.payload.data.map((movie) => movie.id), Array.from({ length: 20 }, (_, i) => i + 1));
    const movie = result.payload.data[0];
    assert.equal(movie.title, 'Inception');
    assert.equal(typeof movie.rating, 'number');
    assert.ok(Array.isArray(movie.genres));
    assert.ok(Array.isArray(movie.cast));
    const detail = await api('/api/movies/1');
    assert.deepEqual(detail.payload.data, movie);
    assert.equal((await api('/api/movies/999')).status, 404);
    assert.equal((await api('/api/movies/no')).status, 422);
});

test('search, genre normalization, combined filters, and shuffle execute real SQL', async () => {
    const filtered = await api('/api/movies?genre=sCi-fI&search=inception');
    assert.deepEqual(filtered.payload.data.map((movie) => movie.id), [1]);
    const director = await api('/api/movies?search=CHRISTOPHER%20NOLAN');
    assert.ok(director.payload.data.length > 1);
    const normal = await api('/api/movies?genre=drama');
    const shuffled = await api('/api/movies?genre=DRAMA&shuffle=true');
    assert.deepEqual(shuffled.payload.data.map((movie) => movie.id).sort((a, b) => a - b), normal.payload.data.map((movie) => movie.id));
    assert.deepEqual((await api('/api/movies?genre=unknown')).payload.data, []);
    assert.equal((await api('/api/movies?shuffle=yes')).status, 422);
});

test('LIKE treats percent, underscore, and backslash as literal characters', async () => {
    await pool.execute(`INSERT INTO movies
        SELECT ?, ?, year, director, genres, rating, duration, synopsis, poster_url, cast_members
        FROM movies WHERE id = 1`, [900, '100%_\\literal']);
    try {
        for (const search of ['%', '_', '\\', '100%_\\']) {
            const result = await api(`/api/movies?search=${encodeURIComponent(search)}`);
            assert.equal(result.status, 200);
            assert.deepEqual(result.payload.data.map((movie) => movie.id), [900]);
        }
        assert.deepEqual((await api('/api/movies?search=' + encodeURIComponent("' OR 1=1 --"))).payload.data, []);
    } finally { await pool.execute('DELETE FROM movies WHERE id = ?', [900]); }
});

test('watchlists and history require authentication for every operation', async () => {
    for (const [path, method, body] of [
        ['/api/watchlist', 'GET'], ['/api/watchlist', 'POST', { movieId: 1 }],
        ['/api/watchlist/1', 'DELETE'], ['/api/watched', 'GET'],
        ['/api/watched', 'POST', { movieId: 1, rating: 5, review: 'Great' }],
    ]) assert.equal((await api(path, { method, body })).status, 401);
});

test('watchlists are private and concurrent duplicate additions return 422', async () => {
    for (const account of [alice, bob]) {
        const result = await api('/api/watchlist', { method: 'POST', token: account.token,
            body: { movieId: 1, movie_id: 1, user_id: 999999 } });
        assert.equal(result.status, 201);
        assert.equal(result.payload.data.movie.id, 1);
    }
    const additions = await Promise.all([1, 2].map(() => api('/api/watchlist', {
        method: 'POST', token: alice.token, body: { movieId: 2 },
    })));
    assert.deepEqual(additions.map((result) => result.status).sort(), [201, 422]);
    const aliceList = await api('/api/watchlist', { token: alice.token });
    const bobList = await api('/api/watchlist', { token: bob.token });
    assert.equal(aliceList.payload.data.length, 2);
    assert.deepEqual(bobList.payload.data.map((entry) => entry.movie_id), [1]);
    assert.equal((await api('/api/watchlist/2', { method: 'DELETE', token: bob.token })).status, 404);
    assert.equal((await api('/api/watchlist', { method: 'POST', token: alice.token, body: { movieId: 999 } })).status, 404);
});

test('viewing removes only its owner\'s watchlist entry and repeat viewings create new records', async () => {
    const first = await api('/api/watched', { method: 'POST', token: alice.token,
        body: { movieId: 1, movie_id: 1, rating: 5, review: ' Excellent ', opinion: 'ignored', user_id: bob.user.id } });
    assert.equal(first.status, 201);
    assert.equal(first.payload.data.review, 'Excellent');
    assert.equal(first.payload.data.rating, 5);
    assert.equal(first.payload.data.movie.rating, 8.8);
    const second = await api('/api/watched', { method: 'POST', token: alice.token,
        body: { movieId: 1, rating: 4, review: 'Watched again' } });
    assert.equal(second.status, 201);
    assert.notEqual(first.payload.data.id, second.payload.data.id);
    assert.equal((await api('/api/watchlist', { token: alice.token })).payload.data.some((entry) => entry.movie_id === 1), false);
    assert.equal((await api('/api/watchlist', { token: bob.token })).payload.data.some((entry) => entry.movie_id === 1), true);
    assert.equal((await api('/api/watched', { token: alice.token })).payload.data.length, 2);
    assert.deepEqual((await api('/api/watched', { token: bob.token })).payload.data, []);
    const removed = await api('/api/watchlist/2', { method: 'DELETE', token: alice.token });
    assert.equal(removed.status, 200);
    assert.equal(removed.payload.data, null);
    assert.equal((await api('/api/watchlist/2', { method: 'DELETE', token: alice.token })).status, 404);
});

test('viewing validation and missing movie responses do not change data', async () => {
    for (const body of [
        { movieId: 1, rating: 0, review: 'Bad rating' },
        { movieId: 1, rating: 6, review: 'Bad rating' },
        { movieId: 1, rating: 1.5, review: 'Bad rating' },
        { movieId: 1, rating: 5, review: ' ' },
        { movieId: '1', rating: 5, review: 'Bad ID type' },
    ]) assert.equal((await api('/api/watched', { method: 'POST', token: alice.token, body })).status, 422);
    assert.equal((await api('/api/watched', { method: 'POST', token: alice.token,
        body: { movieId: 999, rating: 5, review: 'Missing movie' } })).status, 404);
    assert.equal((await api('/api/watched?limit=101', { token: alice.token })).status, 422);
});

test('failed viewing transactions roll back and release connections even after repeated failures', async (t) => {
    t.mock.method(console, 'error', () => {});
    assert.equal((await api('/api/watchlist', { method: 'POST', token: alice.token, body: { movieId: 3 } })).status, 201);
    await database.connection.query(`CREATE TRIGGER force_watchlist_failure BEFORE DELETE ON watchlists
        FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced rollback for test'`);
    try {
        for (let attempt = 0; attempt < 6; attempt++) {
            const result = await api('/api/watched', { method: 'POST', token: alice.token,
                body: { movieId: 3, rating: 5, review: 'Must roll back' } });
            assert.equal(result.status, 500);
        }
        const [[{ reviews }]] = await pool.execute('SELECT COUNT(*) AS reviews FROM reviews WHERE user_id = ? AND movie_id = 3', [alice.user.id]);
        const [[{ entries }]] = await pool.execute('SELECT COUNT(*) AS entries FROM watchlists WHERE user_id = ? AND movie_id = 3', [alice.user.id]);
        assert.equal(reviews, 0);
        assert.equal(entries, 1);
    } finally {
        await database.connection.query('DROP TRIGGER force_watchlist_failure');
    }
    assert.equal((await api('/api/watched', { method: 'POST', token: alice.token,
        body: { movieId: 3, rating: 5, review: 'Pool still works' } })).status, 201);
});

test('history has deterministic tie ordering, UTC dates, and bounded pagination', async () => {
    const account = await registerAndLogin('history_user', 'history@example.com');
    const values = [];
    for (let index = 0; index < 55; index++) values.push(account.user.id, 1, 5, `Viewing ${index}`, '2026-01-01 00:00:00.123');
    await pool.execute(`INSERT INTO reviews (user_id, movie_id, rating, review, created_at) VALUES
        ${Array(55).fill('(?, ?, ?, ?, ?)').join(', ')}`, values);
    const first = await api('/api/watched', { token: account.token });
    const second = await api('/api/watched?page=2', { token: account.token });
    assert.equal(first.payload.data.length, 50);
    assert.equal(second.payload.data.length, 5);
    const all = [...first.payload.data, ...second.payload.data];
    assert.equal(new Set(all.map((entry) => entry.id)).size, 55);
    assert.deepEqual(all.map((entry) => entry.id), all.map((entry) => entry.id).sort((a, b) => b - a));
    assert.equal(all[0].created_at, '2026-01-01T00:00:00.123Z');
});

async function withRecommendationServer(generate, check, timeoutMs = 200) {
    const { createRecommendationHandler } = await import('../../src/controllers/recommendation.controller.js');
    const { recommendationBody } = await import('../../src/validators/movies.validator.js');
    const { validate } = await import('../../src/middleware/validate.js');
    const { errorHandler } = await import('../../src/middleware/errorHandler.js');
    const app = express();
    app.use(express.json());
    app.post('/recommend', validate(recommendationBody), createRecommendationHandler({ generate, timeoutMs }));
    app.use(errorHandler);
    const listener = app.listen(0, '127.0.0.1');
    try {
        await once(listener, 'listening');
        await check(`http://127.0.0.1:${listener.address().port}/recommend`);
    } finally {
        await new Promise((resolve) => { listener.close(resolve); listener.closeAllConnections(); });
    }
}

async function recommend(url, signal) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'mind-bending sci-fi' }), signal });
}

test('recommendations use only the initial 20 database movies and reject invented IDs', async () => {
    for (const movie_id of [1, 999]) {
        await withRecommendationServer(async ({ candidates }) => {
            assert.equal(candidates.length, 20);
            assert.ok(candidates.every((movie) => movie.id >= 1 && movie.id <= 20));
            return { movie_id, reasoning: 'Matches the requested mood' };
        }, async (url) => {
            const result = await recommend(url);
            assert.equal(result.status, movie_id === 1 ? 200 : 502);
            const payload = await result.json();
            if (movie_id === 1) assert.equal(payload.data.movie_id, 1);
            else assert.equal(payload.data, null);
        });
    }
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
        assert.equal((await api('/api/movies/recommend', { method: 'POST', body: { prompt: 'Sci-fi', query: 'ignored' } })).status, 503);
        assert.equal((await api('/api/movies/recommend', { method: 'POST', body: { prompt: ' ' } })).status, 422);
    } finally { if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; }
});

test('incomplete seed data and movies removed during generation are detected', async () => {
    try {
        await pool.execute('DELETE FROM movies WHERE id = 20');
        assert.equal((await api('/api/movies/recommend', { method: 'POST', body: { prompt: 'Sci-fi' } })).status, 503);
    } finally { await seedDatabase(database.connection); }
    try {
        await withRecommendationServer(async () => {
            await pool.execute('DELETE FROM movies WHERE id = 20');
            return { movie_id: 20, reasoning: 'It existed before generation' };
        }, async (url) => assert.equal((await recommend(url)).status, 502));
    } finally { await seedDatabase(database.connection); }
});

test('recommendation timeout returns 504 and aborts real SDK transport', { timeout: 5000 }, async () => {
    const upstream = await createGeminiServer({ hang: true });
    const { generateRecommendation } = await import('../../src/integrations/gemini.js');
    try {
        await withRecommendationServer((input) => generateRecommendation({ ...input, client: upstream.client }), async (url) => {
            const result = await recommend(url);
            assert.equal(result.status, 504);
            await upstream.disconnected;
            assert.equal(upstream.requests.length, 1);
        });
    } finally { await upstream.close(); }
});

test('disconnecting the caller aborts the upstream SDK request', { timeout: 5000 }, async () => {
    const upstream = await createGeminiServer({ hang: true });
    const { generateRecommendation } = await import('../../src/integrations/gemini.js');
    try {
        await withRecommendationServer((input) => generateRecommendation({ ...input, client: upstream.client }), async (url) => {
            const controller = new AbortController();
            const pending = recommend(url, controller.signal);
            await upstream.received;
            controller.abort();
            await assert.rejects(pending);
            await upstream.disconnected;
        }, 3000);
    } finally { await upstream.close(); }
});

test('accounts and viewing history persist across actual API process restarts', async () => {
    for (let restart = 0; restart < 2; restart++) {
        const child = await startApiProcess();
        try {
            const response = await fetch(child.origin + '/api/watched', {
                headers: { Authorization: `Bearer ${alice.token}` }, signal: AbortSignal.timeout(3000),
            });
            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.ok(payload.data.some((entry) => entry.review === 'Pool still works'));
        } finally { await child.stop(); }
    }
});

test('foreign keys cascade dependent records when an account is deleted', async () => {
    const [result] = await pool.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        ['cascade_user', 'cascade@example.com', 'x'.repeat(60)]);
    await pool.execute('INSERT INTO watchlists (user_id, movie_id) VALUES (?, ?)', [result.insertId, 1]);
    await pool.execute('INSERT INTO reviews (user_id, movie_id, rating, review) VALUES (?, ?, ?, ?)', [result.insertId, 1, 5, 'Cascade']);
    await pool.execute('DELETE FROM users WHERE id = ?', [result.insertId]);
    for (const table of ['watchlists', 'reviews']) {
        const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?`, [result.insertId]);
        assert.equal(total, 0);
    }
});

test('Express serves the public frontend while API errors and private files stay separate', async () => {
    const index = await fetch(base + '/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.match(await index.text(), /FilmLog/);
    const policy = index.headers.get('content-security-policy');
    assert.match(policy, /https:\/\/cdn\.tailwindcss\.com/);
    assert.match(policy, /script-src-attr 'unsafe-inline'/);
    const script = await fetch(base + '/app.js');
    assert.equal(script.status, 200);
    assert.match(await script.text(), /window\.location\.origin/);
    for (const path of ['/api/unknown', '/.env', '/API/.env', '/src/database/connection.js']) {
        const result = await api(path);
        assert.equal(result.status, 404);
        assert.equal(result.payload.data, null);
    }
    const ownOrigin = await api('/api/health', { origin: base });
    assert.equal(ownOrigin.status, 200);
    const apiPolicy = ownOrigin.response.headers.get('content-security-policy');
    assert.doesNotMatch(apiPolicy, /https:\/\/cdn\.tailwindcss\.com/);
});

test('merged setup and seed files are safe to import and still run as commands', async () => {
    const run = promisify(execFile);
    const setup = new URL('../../src/database/setup.js', import.meta.url);
    const seed = new URL('../../src/database/seed.js', import.meta.url);
    const importOnly = `const setup = await import(${JSON.stringify(setup.href)});
        const seed = await import(${JSON.stringify(seed.href)});
        if (typeof setup.applySchema !== 'function' || typeof seed.seedDatabase !== 'function') throw new Error('Missing exports');
        console.log('Import only: no commands executed');`;
    const imported = await run(process.execPath, ['--input-type=module', '-e', importOnly], {
        env: { ...process.env, DB_PORT: '1' }, timeout: 5000, windowsHide: true,
    });
    assert.equal(imported.stdout.trim(), 'Import only: no commands executed');
    const isolated = await createTestDatabase();
    try {
        const options = { env: { ...process.env, DB_NAME: isolated.name }, timeout: 10000, windowsHide: true };
        const created = await run(process.execPath, [fileURLToPath(setup)], options);
        assert.match(created.stdout, /FilmLog tables are ready/);
        const seeded = await run(process.execPath, [fileURLToPath(seed)], options);
        assert.match(seeded.stdout, /Seeded the 20 FilmLog movies/);
        const [[{ total }]] = await isolated.connection.query('SELECT COUNT(*) AS total FROM movies');
        assert.equal(total, 20);
    } finally { await isolated.dispose(); }
});
