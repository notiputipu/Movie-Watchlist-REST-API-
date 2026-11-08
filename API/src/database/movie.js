export function toMovie(row) {
    return {
        id: row.id, title: row.title, year: row.year, director: row.director,
        genres: typeof row.genres === 'string' ? JSON.parse(row.genres) : row.genres,
        rating: Number(row.rating), duration: row.duration, synopsis: row.synopsis,
        poster_url: row.poster_url,
        cast: typeof row.cast_members === 'string' ? JSON.parse(row.cast_members) : row.cast_members,
    };
}
