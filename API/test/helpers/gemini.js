import http from 'node:http';
import { once } from 'node:events';
import { createGeminiClient } from '../../src/integrations/gemini.js';

export async function createGeminiServer({ hang = false, status = 200, text = '{"movie_id":1,"reasoning":"A fitting movie"}', continuation = false } = {}) {
    const requests = [];
    const received = Promise.withResolvers();
    const disconnected = Promise.withResolvers();
    const server = http.createServer(async (req, res) => {
        res.on('close', () => { if (!res.writableEnded) disconnected.resolve(); });
        let body = '';
        for await (const chunk of req) body += chunk;
        requests.push({ url: req.url, body: JSON.parse(body) });
        received.resolve();
        if (hang) return;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status === 200 ? {
            candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: continuation ? 'CONTINUATION' : 'STOP' }],
            ...(continuation ? { continuationToken: 'must-not-continue' } : {}),
        } : { error: { code: status, message: 'Test upstream error', status: 'RESOURCE_EXHAUSTED' } }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return {
        client: createGeminiClient({ apiKey: 'controlled-test-key', baseUrl: `http://127.0.0.1:${server.address().port}` }),
        requests, received: received.promise, disconnected: disconnected.promise,
        async close() {
            await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
        },
    };
}
