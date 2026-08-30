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

// systems
export * from './ladder/ladder.js';
export * from './match/resolve.js';
