import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { watchlistBody } from '../validators/watchlist.validator.js';
import { watchlistParams } from '../validators/common.js';
import { listWatchlist, addWatchlist, removeWatchlist } from '../controllers/watchlist.controller.js';

export const watchlistRouter = Router();
watchlistRouter.use(requireAuth);
watchlistRouter.get('/', listWatchlist);
watchlistRouter.post('/', validate(watchlistBody), addWatchlist);
watchlistRouter.delete('/:movieId', validate(watchlistParams, 'params'), removeWatchlist);
