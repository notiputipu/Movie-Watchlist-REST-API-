import { pool } from '../database/connection.js';
import { seededIds } from '../database/dataset.js';
import { toMovie } from '../database/movie.js';
import { generateRecommendation } from '../integrations/gemini.js';
import { recommendationResult } from '../validators/movies.validator.js';
import { HttpError } from '../errors.js';
import { sendSuccess } from '../response.js';

export function createRecommendationHandler({ generate = generateRecommendation, timeoutMs = 20000 } = {}) {
    return async (req, res) => {
        const [rows] = await pool.execute(`SELECT * FROM movies WHERE id IN (${seededIds.map(() => '?').join(', ')})`, seededIds);
        if (rows.length !== seededIds.length) throw new HttpError(503, 'Movie dataset is incomplete; run db:seed');
        if (req.aborted || res.destroyed) return;
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error('Gemini request deadline exceeded'));
        }, timeoutMs);
        const onClose = () => {
            if (!res.writableEnded) controller.abort(new Error('Client disconnected'));
        };
        res.on('close', onClose);
        try {
            const output = await generate({
                prompt: res.locals.validated.body.prompt,
                candidates: rows.map(toMovie), signal: controller.signal,
            });
            if (controller.signal.aborted) {
                if (timedOut) throw new HttpError(504, 'Gemini request timed out');
                return;
            }
            const parsed = recommendationResult.safeParse(output);
            if (!parsed.success || !seededIds.includes(parsed.data.movie_id)) {
                throw new HttpError(502, 'gemini return invalid recommendation');
            }
            const [[movie]] = await pool.execute('SELECT id FROM movies WHERE id = ?', [parsed.data.movie_id]);
            if (!movie) throw new HttpError(502, 'recommended movie unavailable');
            sendSuccess(res, parsed.data);
        } catch (error) {
            if (controller.signal.aborted) {
                if (timedOut && !res.destroyed) throw new HttpError(504, 'request timed out');
                return;
            }
            throw error;
        } finally {
            clearTimeout(timer);
            res.off('close', onClose);
        }
    };
}
