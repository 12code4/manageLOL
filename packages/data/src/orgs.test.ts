import { describe, expect, it } from 'vitest';
import { ORGS, ORG_BY_ID, ORG_NAME_PARTS, orgsOfRegion } from './orgs.js';
import { REGIONS } from './regions.js';

describe('org pack', () => {
  it('has a healthy population spread across every region', () => {
    expect(ORGS.length).toBeGreaterThanOrEqual(60);
    for (const r of REGIONS) expect(orgsOfRegion(r.id).length).toBeGreaterThanOrEqual(8);
  });

  it('has unique ids and unique scoreboard tags', () => {
    expect(new Set(ORGS.map((o) => o.id)).size).toBe(ORGS.length);
    expect(new Set(ORGS.map((o) => o.tag)).size).toBe(ORGS.length);
    expect(new Set(ORGS.map((o) => o.name)).size).toBe(ORGS.length);
  });

  it('tags are 2-4 uppercase letters and ids are slugs', () => {
    for (const o of ORGS) {
      expect(o.tag).toMatch(/^[A-Z0-9]{2,4}$/);
      expect(o.id).toMatch(/^[a-z]{3}-[a-z]+$/);
      expect(o.blurb.length).toBeGreaterThan(20);
    }
  });

  it('every org sits in a known region and the index resolves', () => {
    const ids = new Set(REGIONS.map((r) => r.id as string));
    for (const o of ORGS) {
      expect(ids.has(o.region as string)).toBe(true);
      expect(ORG_BY_ID[o.id]).toBe(o);
    }
  });

  it('every personality is represented enough to matter', () => {
    const counts = new Map<string, number>();
    for (const o of ORGS) counts.set(o.personality, (counts.get(o.personality) ?? 0) + 1);
    for (const p of ['superteam', 'academy', 'stable', 'chaotic', 'methodical']) {
      expect(counts.get(p) ?? 0).toBeGreaterThanOrEqual(8);
    }
  });

  it('generated-name parts can build a large collision-free space', () => {
    const { prefixes, suffixes, standalone } = ORG_NAME_PARTS;
    expect(prefixes.length * suffixes.length + standalone.length).toBeGreaterThan(200);
    const handcrafted = new Set(ORGS.map((o) => o.name));
    for (const p of prefixes) for (const s of suffixes) expect(handcrafted.has(p + s)).toBe(false);
  });

  it('ships no real-world organization names (IP guard)', () => {
    const banned = /\b(riot|faker|t1|g2|fnatic|cloud9|tsm|sk\s?telecom|edward gaming|damwon|liquid)\b/i;
    for (const o of ORGS) {
      expect(banned.test(o.name)).toBe(false);
      expect(banned.test(o.blurb)).toBe(false);
    }
  });
});
