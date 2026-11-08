import jwt from 'jsonwebtoken';
import { pool } from '../database/connection.js';
import { sendError } from '../response.js';

export function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
        throw new Error('JWT_SECRET must contain at least 32 bytes. Generate one and set it in .env.');
    }
    return secret;
}

export async function requireAuth(req, res, next) {
    const match = req.get('Authorization')?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
        sendError(res, 401, 'Authentication required');
        return;
    }
    let payload;
    try {
        payload = jwt.verify(match[1], getJwtSecret(), { algorithms: ['HS256'] });
        if (typeof payload !== 'object' || typeof payload.sub !== 'string'
            || !Number.isInteger(payload.exp) || !/^[1-9]\d*$/.test(payload.sub)
            || !Number.isSafeInteger(Number(payload.sub)) || Number(payload.sub) > 4294967295) {
            throw new Error('Invalid subject');
        }
    } catch {
        sendError(res, 401, 'Invalid or expired token');
        return;
    }
    const [[user]] = await pool.execute('SELECT id, username, email FROM users WHERE id = ?', [Number(payload.sub)]);
    if (!user) {
        sendError(res, 401, 'Invalid or expired token');
        return;
    }
    req.user = user;
    next();
}
