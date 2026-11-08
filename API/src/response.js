export function sendSuccess(res, data, status = 200) {
    const body = { success: true, data, error: null };
    res.status(status).json(body);
}
export function sendError(res, status, message) {
    const body = { success: false, data: null, error: message };
    res.status(status).json(body);
}
