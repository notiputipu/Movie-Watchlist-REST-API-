import { z } from 'zod';

export const integerQuery = z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer')
    .transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
export const movieId = z.number().int().positive().max(4294967295);
export const movieParams = z.object({ id: integerQuery.pipe(z.number().max(4294967295)) });
export const watchlistParams = z.object({ movieId: integerQuery.pipe(z.number().max(4294967295)) });
export const historyQuery = z.object({
    page: integerQuery.default(1),
    limit: integerQuery.pipe(z.number().max(100)).default(50),
}).refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
    message: 'Pagination offset is too large', path: ['page'],
});
