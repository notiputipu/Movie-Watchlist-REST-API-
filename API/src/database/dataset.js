import { readFileSync } from 'node:fs';
import { z } from 'zod';

const movieSchema = z.object({
    id: z.number().int().min(1).max(20),
    title: z.string().min(1).max(255),
    year: z.number().int().min(1800).max(2100),
    director: z.string().min(1).max(255),
    genres: z.array(z.string().trim().min(1)).min(1),
    rating: z.number().min(0).max(10),
    duration: z.string().min(1).max(50),
    synopsis: z.string().min(1),
    poster_url: z.string().url().regex(/^https?:\/\//),
    cast: z.array(z.string().min(1)),
});
export const datasetSchema = z.array(movieSchema).length(20).refine(
    (movies) => new Set(movies.map((movie) => movie.id)).size === 20,
    'Dataset must contain unique movie IDs 1–20',
);
export const seedMovies = datasetSchema.parse(JSON.parse(
    readFileSync(new URL('../../../data/movies.json', import.meta.url), 'utf8'),
));
export const seededIds = seedMovies.map((movie) => movie.id);
export const genreLabels = new Map(seedMovies.flatMap((movie) => movie.genres)
    .map((genre) => [genre.toLowerCase(), genre]));
