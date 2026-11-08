import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { once } from 'node:events';

export async function startFrontendServer() {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const server = http.createServer(async (req, res) => {
        try {
            const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            if (!pathname.startsWith('/frontend/') && pathname !== '/data/movies.json') {
                res.writeHead(404).end();
                return;
            }
            const path = resolve(root, '.' + pathname);
            if (!path.startsWith(resolve(root) + sep)) throw new Error('Invalid path');
            const data = await readFile(path.endsWith(sep) ? resolve(path, 'index.html') : path);
            res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') ? 'application/json' : 'text/html');
            res.end(data);
        } catch { res.writeHead(404).end(); }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
