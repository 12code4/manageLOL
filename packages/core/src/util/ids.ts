/**
 * Branded ID types + deterministic minting.
 *
 * Branded string types make it a compile error to pass a PlayerId where an
 * OrgId is expected, at zero runtime cost. IDs are minted from a single counter
 * that lives in world state, so a given world's IDs are stable and reproducible.
 */

declare const brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [brand]: B };

export type PlayerId = Branded<string, 'PlayerId'>;
export type OrgId = Branded<string, 'OrgId'>;
export type StaffId = Branded<string, 'StaffId'>;
export type ContractId = Branded<string, 'ContractId'>;
export type CompetitionId = Branded<string, 'CompetitionId'>;
export type MatchId = Branded<string, 'MatchId'>;
export type SponsorId = Branded<string, 'SponsorId'>;
export type LadderEntryId = Branded<string, 'LadderEntryId'>;
export type ChampionId = Branded<string, 'ChampionId'>;

/** Serializable monotonic ID minter. Persist `state` inside the world save. */
export class IdMint {
  constructor(private state: Record<string, number> = {}) {}

  /** Mint the next id for a prefix, e.g. mint('plr') → 'plr_000001'. */
  mint<T extends string>(prefix: string): Branded<string, T> {
    const n = (this.state[prefix] ?? 0) + 1;
    this.state[prefix] = n;
    return `${prefix}_${n.toString().padStart(6, '0')}` as Branded<string, T>;
  }

  /** Snapshot for serialization. */
  toJSON(): Record<string, number> {
    return { ...this.state };
  }

  static fromJSON(state: Record<string, number>): IdMint {
    return new IdMint({ ...state });
  }
}
