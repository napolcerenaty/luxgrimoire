import { generateSlug, generateSubscriptionSlug, generateSlugFromParts } from './slug.util';

const HEX8 = '[0-9a-f]{8}';

describe('generateSlug', () => {
  it('lowercases, strips punctuation and appends an 8-char hex suffix', () => {
    expect(generateSlug('Hello World!')).toMatch(new RegExp(`^hello-world-${HEX8}$`));
  });

  it('produces a fresh suffix each call', () => {
    expect(generateSlug('Same Name')).not.toBe(generateSlug('Same Name'));
  });
});

describe('generateSubscriptionSlug', () => {
  it('strips a leading company-name prefix from the sub name', () => {
    expect(generateSubscriptionSlug('Locked Library', 'Locked Library Adult')).toMatch(
      new RegExp(`^adult-${HEX8}$`),
    );
  });

  it('strips billing/plan noise words', () => {
    expect(generateSubscriptionSlug('FairyLoot', 'Adult Fantasy Quarterly')).toMatch(
      new RegExp(`^adult-fantasy-${HEX8}$`),
    );
  });

  it('falls back to the company name when nothing meaningful is left', () => {
    expect(generateSubscriptionSlug('Locked Library', 'Locked Library Monthly')).toMatch(
      new RegExp(`^locked-library-${HEX8}$`),
    );
    expect(generateSubscriptionSlug('Acme', 'Acme Payment Plan')).toMatch(new RegExp(`^acme-${HEX8}$`));
  });
});

describe('generateSlugFromParts', () => {
  it('joins the truthy parts and slugifies them', () => {
    expect(generateSlugFromParts('Alpha', null, 'Beta', undefined, '')).toMatch(
      new RegExp(`^alpha-beta-${HEX8}$`),
    );
  });
});
