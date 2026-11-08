import { ZodError } from 'zod';
import { sendError } from '../response.js';
import { HttpError } from '../errors.js';
export const errorHandler = (error, _req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }
    if (error instanceof HttpError) {
        sendError(res, error.status, error.message);
        return;
    }
    if (error instanceof ZodError) {
        const message = error.issues
            .map((issue) => {
            const path = issue.path.map(String).join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
        })
            .join('; ');
        sendError(res, 422, message);
        return;
    }
    if (error instanceof Error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
        sendError(res, 422, 'record already exists');
        return;
    }
    if (error instanceof Error && 'type' in error) {
        if (error.type === 'entity.parse.failed') {
            sendError(res, 400, 'Invalid JSON body');
            return;
        }
        if (error.type === 'entity.too.large') {
            sendError(res, 413, 'Request body too large');
            return;
        }
    }
    console.error('Unexpected API error:', error);
    sendError(res, 500, 'Internal server error');
};
