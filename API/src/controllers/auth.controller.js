import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../database/connection.js';
import { getJwtSecret } from '../middleware/auth.js';
import { sendError, sendSuccess } from '../response.js';

const dummyHash = bcrypt.hash('not-an-account-password', 12);

export async function register(_req, res) {
    const { username, email, password } = res.locals.validated.body;
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash],
    );
    sendSuccess(res, { user: { id: result.insertId, username, email } }, 201);
}

export async function login(_req, res) {
    const { email, password } = res.locals.validated.body;
    const [[row]] = await pool.execute('SELECT id, username, email, password_hash FROM users WHERE email = ?', [email]);
    const matches = await bcrypt.compare(password, row?.password_hash ?? await dummyHash);
    if (!row || !matches) {
        sendError(res, 401, 'Invalid email or password');
        return;
    }
    const user = { id: row.id, username: row.username, email: row.email };
    const token = jwt.sign({}, getJwtSecret(), { algorithm: 'HS256', subject: String(row.id), expiresIn: '1d' });
    sendSuccess(res, { token, user });
}
