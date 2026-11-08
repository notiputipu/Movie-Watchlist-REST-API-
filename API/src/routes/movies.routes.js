import { Router } from 'express';
import { listMovies, getMovie } from '../controllers/movies.controller.js';
import { validate } from '../middleware/validate.js';
import { moviesQuery, recommendationBody } from '../validators/movies.validator.js';
import { movieParams } from '../validators/common.js';
import { createRecommendationHandler } from '../controllers/recommendation.controller.js';

export const moviesRouter = Router();
moviesRouter.get('/', validate(moviesQuery, 'query'), listMovies);
moviesRouter.post('/recommend', validate(recommendationBody), createRecommendationHandler());
moviesRouter.get('/:id', validate(movieParams, 'params'), getMovie);
