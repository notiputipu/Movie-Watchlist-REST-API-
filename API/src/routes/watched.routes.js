import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { watchedBody } from '../validators/watchlist.validator.js';
import { historyQuery } from '../validators/common.js';
import { listWatched, addWatched } from '../controllers/watched.controller.js';

export const watchedRouter = Router();
watchedRouter.use(requireAuth);
watchedRouter.get('/', validate(historyQuery, 'query'), listWatched);
watchedRouter.post('/', validate(watchedBody), addWatched);
