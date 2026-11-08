import { z } from 'zod';
import { movieId } from './common.js';

export const watchlistBody = z.object({ movieId });
export const watchedBody = z.object({
    movieId,
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().min(1).max(5000),
});
