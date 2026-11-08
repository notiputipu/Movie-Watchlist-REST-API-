import { z } from 'zod';

export const moviesQuery = z.object({
    search: z.string().trim().max(200).optional(),
    genre: z.string().trim().max(50).optional(),
    shuffle: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});
export const recommendationBody = z.object({ prompt: z.string().trim().min(1).max(1000) });
export const recommendationResult = z.object({
    movie_id: z.number().int().positive(),
    reasoning: z.string().trim().min(1).max(2000),
}).strict();
