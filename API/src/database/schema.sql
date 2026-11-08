CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(60) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY users_username_unique (username),
    UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movies (
    id INT UNSIGNED NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    year SMALLINT UNSIGNED NOT NULL,
    director VARCHAR(255) NOT NULL,
    genres JSON NOT NULL,
    rating DECIMAL(3,1) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    synopsis TEXT NOT NULL,
    poster_url TEXT NOT NULL,
    cast_members JSON NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS watchlists (
    user_id INT UNSIGNED NOT NULL,
    movie_id INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, movie_id),
    CONSTRAINT watchlists_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT watchlists_movie_fk FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    movie_id INT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    review TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT reviews_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT reviews_movie_fk FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    INDEX reviews_user_history (user_id, created_at, id)
) ENGINE=InnoDB;
