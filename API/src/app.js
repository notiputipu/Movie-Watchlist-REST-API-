import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sendError } from './response.js';
import { getHealth } from './controllers/health.controller.js';
import { authRouter } from './routes/auth.routes.js';
import { moviesRouter } from './routes/movies.routes.js';
import { watchlistRouter } from './routes/watchlist.routes.js';
import { watchedRouter } from './routes/watched.routes.js';
export const app = express();
const allowedOrigins = new Set((process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map((origin) => origin.trim()).filter(Boolean));
for (const origin of allowedOrigins) {
    if (!/^https?:$/.test(new URL(origin).protocol) || new URL(origin).origin !== origin) {
        throw new Error('CORS_ORIGINS must contain exact HTTP(S) origins without paths or wildcards.');
    }
}
app.use(helmet({
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
    contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null } },
}));
app.use(cors((req, callback) => callback(null, {
    origin(origin, callback) {
        const sameOrigin = `${req.protocol}://${req.get('host')}`;
        if (!origin || origin === sameOrigin || allowedOrigins.has(origin)) callback(null, true);
        else callback(new HttpError(403, 'Origin is not allowed'));
    },
    methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
})));
// parse valid JSON values, zod decides whether their shape is acceptable
app.use(express.json({ strict: false }));
app.get('/api/health', getHealth);
app.use('/api/auth', authRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/watched', watchedRouter);
// Unknown API URL must stay JSON errors, rather than falling through to files
app.use('/api', (_req, res) => sendError(res, 404, 'Route not found'));

// Keep the stricter API policy above, apply this policy only to public files
app.use(helmet.contentSecurityPolicy({ directives: {
    'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://unpkg.com'],
    'script-src-attr': ["'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'https:', 'data:'],
    'connect-src': ["'self'", 'https:', 'http://localhost:*', 'http://127.0.0.1:*'],
    'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
} }));
const frontendPath = fileURLToPath(new URL('../../frontend/', import.meta.url));
app.use(express.static(frontendPath));
app.use((_req, res) => {
    sendError(res, 404, 'Route not found');
});
app.use(errorHandler);
