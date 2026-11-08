export function validate(schema, source = 'body') {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            next(result.error);
            return;
        }
        //keep parsed values separate from the original request properties
        res.locals.validated ??= {};
        res.locals.validated[source] = result.data;
        next();
    };
}
