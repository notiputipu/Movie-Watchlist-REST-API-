import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGeminiClient, generateRecommendation } from '../../src/integrations/gemini.js';
import { createGeminiServer } from '../helpers/gemini.js';

const candidates = [{ id: 1, title: 'Inception', genres: ['Sci-Fi'], synopsis: 'Dreams within dreams.' }];

test('installed Gemini SDK sends a constrained JSON schema and does not continue automatically', async () => {
    const upstream = await createGeminiServer({ continuation: true });
    try {
        const result = await generateRecommendation({ prompt: 'Sci-fi', candidates, client: upstream.client });
        assert.equal(result.movie_id, 1);
        assert.equal(upstream.requests.length, 1);
        const config = upstream.requests[0].body.generationConfig;
        assert.equal(config.maxOutputTokens, 1024);
        assert.equal(config.responseMimeType, 'application/json');
        assert.deepEqual(config.responseJsonSchema.properties.movie_id.enum, [1]);
    } finally { await upstream.close(); }
});

test('Gemini quota errors do not retry, and missing configuration returns 503', async () => {
    assert.throws(() => createGeminiClient({ apiKey: '' }), { status: 503 });
    const upstream = await createGeminiServer({ status: 429 });
    try {
        await assert.rejects(generateRecommendation({ prompt: 'Sci-fi', candidates, client: upstream.client }), { status: 503 });
        assert.equal(upstream.requests.length, 1);
    } finally { await upstream.close(); }
});

test('invalid Gemini JSON and invalid fields return 502', async () => {
    for (const text of ['not JSON', '{"movie_id":"1","reasoning":"bad type"}', '{"movie_id":1,"reasoning":""}']) {
        const upstream = await createGeminiServer({ text });
        try {
            await assert.rejects(generateRecommendation({ prompt: 'Sci-fi', candidates, client: upstream.client }), { status: 502 });
        } finally { await upstream.close(); }
    }
});

test('installed SDK abort signal closes an actual pending HTTP request', { timeout: 5000 }, async () => {
    const upstream = await createGeminiServer({ hang: true });
    const controller = new AbortController();
    try {
        const pending = generateRecommendation({ prompt: 'Sci-fi', candidates, client: upstream.client, signal: controller.signal });
        await upstream.received;
        controller.abort();
        await assert.rejects(pending);
        await upstream.disconnected;
        assert.equal(upstream.requests.length, 1);
    } finally { await upstream.close(); }
});
