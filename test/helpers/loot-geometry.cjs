'use strict';
// Flat terrain for transfer/UI tests; geometry tests also exercise the real game collider.
const flatCollider = {
  raycast: () => Infinity,
  surfaceHit: (p, dir, max) => ({ dist: dir[1] < 0 && p[1] / -dir[1] <= max ? p[1] / -dir[1] : Infinity, normal: [0, 1, 0] }),
};
module.exports = { flatCollider };
