import assert from 'node:assert/strict';
import test from 'node:test';
import {getRoute, normalizeUrl} from './router.js';

test('normalizes trailing slashes in frontend routes', () => {
  assert.equal(normalizeUrl('/cards/'), '/cards');
  assert.equal(normalizeUrl('/search-location/'), '/search-location');
  assert.equal(normalizeUrl('/box/123/'), '/box/123');
  assert.equal(normalizeUrl('/'), '/');
});

test('parses browser routes and legacy tab query parameters', () => {
  assert.deepEqual(getRoute('/'), {name: 'dashboard'});
  assert.deepEqual(getRoute('/cards'), {name: 'cards'});
  assert.deepEqual(getRoute('/search-location'), {name: 'search'});
  assert.deepEqual(getRoute('/containers'), {name: 'containers'});
  assert.deepEqual(getRoute('/scanner'), {name: 'scanner'});
  assert.deepEqual(getRoute('/box/abc-123'), {name: 'box', id: 'abc-123'});
  assert.deepEqual(getRoute('/missing'), {name: 'not-found'});
  assert.deepEqual(getRoute('/?tab=cards'), {name: 'cards'});
  assert.deepEqual(getRoute('/?tab=scan'), {name: 'scanner'});
});
