import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_ROUTES,
  VENUES,
  notePath,
  photoPath,
  projectPath,
  venueSegment,
} from '../../src/config/venues';

test('maps stable domain keys to current public venues', () => {
  assert.deepEqual(VENUES, {
    photos: { label: 'Darkroom', path: '/darkroom' },
    notes: { label: 'Field Notes', path: '/field-notes' },
    projects: { label: 'The Lab', path: '/the-lab' },
  });
});

test('keeps venue labels and paths unique', () => {
  const venues = Object.values(VENUES);
  assert.equal(new Set(venues.map(({ label }) => label)).size, venues.length);
  assert.equal(new Set(venues.map(({ path }) => path)).size, venues.length);
});

test('builds item paths from the registry', () => {
  assert.equal(photoPath('red-bus'), '/darkroom/red-bus');
  assert.equal(notePath('pytorch-intro'), '/field-notes/pytorch-intro');
  assert.equal(projectPath('cuda-lab'), '/the-lab/cuda-lab');
  assert.equal(APP_ROUTES.home, '/');
});

test('derives router segments from venue paths', () => {
  assert.equal(venueSegment('photos'), 'darkroom');
  assert.equal(venueSegment('notes'), 'field-notes');
  assert.equal(venueSegment('projects'), 'the-lab');
});
