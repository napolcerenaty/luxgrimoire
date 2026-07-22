import { matchSubscription } from './subscription-match.util';

describe('matchSubscription (spec 4.1b — confidence threshold)', () => {
  it('always matches when the company has only one subscription, even with no target text', () => {
    const result = matchSubscription([{ id: 'sub-1', name: 'The Locked Library' }], undefined);
    expect(result).toEqual({ subscriptionId: 'sub-1', confidence: 1 });
  });

  it('clear case: exact name match against the main box, well ahead of the spin-off', () => {
    const candidates = [
      { id: 'main', name: 'The Locked Library' },
      { id: 'villains', name: 'The Locked Library: Villains Edition' },
    ];
    const result = matchSubscription(candidates, 'The Locked Library');
    expect(result.subscriptionId).toBe('main');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('ambiguous case: text doesn\'t clearly favor either of two similarly-named subscriptions — no pre-select', () => {
    const candidates = [
      { id: 'main', name: 'The Locked Library' },
      { id: 'villains', name: 'The Locked Library: Villains' },
    ];
    // Deliberately vague — doesn't mention "Villains" at all, but is textually
    // close to both names since they share the same long prefix.
    const result = matchSubscription(candidates, 'The Locked Library pick');
    expect(result.subscriptionId).toBeNull();
  });

  it('returns no match (not a crash) when no target text is available and there are multiple candidates', () => {
    const candidates = [
      { id: 'a', name: 'FairyLoot YA' },
      { id: 'b', name: 'FairyLoot Romantasy' },
    ];
    expect(matchSubscription(candidates, undefined)).toEqual({ subscriptionId: null, confidence: 0 });
  });

  it('returns no match when there are no candidates at all', () => {
    expect(matchSubscription([], 'anything')).toEqual({ subscriptionId: null, confidence: 0 });
  });
});
