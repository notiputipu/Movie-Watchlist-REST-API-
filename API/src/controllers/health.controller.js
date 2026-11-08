import { sendSuccess } from '../response.js';

export function getHealth(_req, res) {
    sendSuccess(res, { status: 'ok', service: 'filmlog-api' });
}
