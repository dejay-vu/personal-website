import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPhotoURL,
  getPhotoSearchState,
} from '../../src/modules/photos/query';

test('keeps photo search state on the photos domain seam', () => {
  const state = getPhotoSearchState({
    cursor: 'photo_1',
    country: [' japan ', 'uk'],
    limit: '12',
    q: ' night ',
  });

  assert.deepEqual(state, {
    filters: { country: ['japan', 'uk'] },
    q: 'night',
  });
  assert.equal(
    buildPhotoURL({
      filters: state.filters,
      photoSlug: 'city-lights',
      q: state.q,
    }),
    '/darkroom/city-lights?q=night&country=japan&country=uk',
  );
});
