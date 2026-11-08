import { Router } from 'express';
import { register, login } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';

export const authRouter = Router();
authRouter.post('/register', validate(registerSchema), register);
authRouter.post('/login', validate(loginSchema), login);
