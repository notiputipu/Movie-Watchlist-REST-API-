import assert from 'node:assert/strict';
import { test } from 'node:test';
import { datasetSchema, seedMovies, genreLabels } from '../../src/database/dataset.js';

test('seed validation rejects missing IDs, duplicates, and invalid metadata', () => {
    assert.equal(datasetSchema.safeParse(seedMovies.slice(1)).success, false);
    const duplicate = structuredClone(seedMovies);
    duplicate[1].id = duplicate[0].id;
    assert.equal(datasetSchema.safeParse(duplicate).success, false);
    const invalid = structuredClone(seedMovies);
    invalid[0].rating = 99;
    assert.equal(datasetSchema.safeParse(invalid).success, false);
    invalid[0].poster_url = 'javascript:alert(1)';
    assert.equal(datasetSchema.safeParse(invalid).success, false);
});

test('genre lookup preserves frontend display labels', () => {
    assert.equal(genreLabels.get('sci-fi'), 'Sci-Fi');
    assert.equal(genreLabels.get('drama'), 'Drama');
});
