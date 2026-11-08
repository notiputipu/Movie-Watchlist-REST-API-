import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function startApiProcess() {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../src/server.js', import.meta.url))], {
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    const stop = async () => {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit');
            child.kill();
            await exited;
        }
    };
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('API subprocess did not start')), 5000);
            child.once('error', (error) => { clearTimeout(timer); reject(error); });
            child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`API subprocess exited with ${code}`)); });
            child.stdout.on('data', (data) => {
                if (data.toString().includes('FilmLog API is running')) { clearTimeout(timer); resolve(); }
            });
            child.stderr.resume();
        });
        return { origin: `http://127.0.0.1:${port}`, stop };
    } catch (error) {
        await stop();
        throw error;
    }
}
