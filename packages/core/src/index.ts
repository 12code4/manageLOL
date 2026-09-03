/**
 * @managelol/core — the pure, deterministic simulation engine.
 *
 * No DOM, no I/O. Everything the game *is* lives here. See CLAUDE.md for the
 * determinism contract and docs/05-systems for the design specs each module
 * implements.
 */

// foundation
export { Rng, RngSource } from './rng/rng.js';
export * from './util/math.js';
export * from './util/ids.js';
export * from './world/clock.js';
export * from './world/fixtures.js';
export * from './world/orgs.js';
export * from './world/contracts.js';

// players
export * from './players/types.js';
export {
  ATTRIBUTE_META, ATTR_BY_KEY, HIDDEN_KEYS, FOGGED_KEYS, readAttr,
  type AttrKey, type AttrGroup, type Visibility, type Volatility, type AttrMeta,
} from './players/attributes.js';
export * from './players/ratings.js';
export * from './players/scouting.js';
export * from './players/generate.js';
export * from './players/meshing.js';
export * from './players/development.js';

// systems
export * from './ladder/ladder.js';
export * from './ladder/bands.js';
export * from './match/resolve.js';
export * from './players/pool.js';
export * from './meta/patches.js';
export * from './draft/draft.js';
export * from './match/ticks.js';

// The season: the calendar, the pyramid, and the fast path that runs the world.
export * from './season/calendar.js';
export * from './season/fast.js';
