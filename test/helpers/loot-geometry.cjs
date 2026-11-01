'use strict';
// Flat terrain for transfer/UI tests; geometry tests also exercise the real game collider.
const flatCollider = {
  raycast: () => Infinity,
  surfaceHit: (p) => ({ dist: p[1], normal: [0, 1, 0] }),
};
module.exports = { flatCollider };
