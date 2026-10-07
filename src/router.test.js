import assert from 'node:assert/strict';
import test from 'node:test';
import {getRoute, isValidContainerId, normalizeUrl} from './router.js';

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

test('accepts actual Riftbound container UUIDs and rejects URL payloads', () => {
  const valid = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(isValidContainerId(valid), true);
  assert.equal(isValidContainerId('https://example.com/box/550e8400-e29b-41d4-a716-446655440000'), false);
  assert.equal(isValidContainerId('/box/550e8400-e29b-41d4-a716-446655440000'), false);
  assert.equal(isValidContainerId('not-a-uuid'), false);
});
