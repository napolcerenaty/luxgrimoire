/**
 * Confidence-gated subscription matching for month-theme reveals (spec 4.1b).
 * Deliberately NOT another AI call — this is a plain string-similarity problem
 * (matching an extracted subscription name against a company's own subscription
 * names), and keeping it local/deterministic makes it cheap, fast, and testable.
 */

function bigrams(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) grams.add(normalized.slice(i, i + 2));
  return grams;
}

/** Sørensen–Dice coefficient over character bigrams, 0 (nothing alike) .. 1 (identical). */
export function diceCoefficient(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) if (setB.has(gram)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

export interface SubscriptionCandidate {
  id: string;
  name: string;
}

export interface SubscriptionMatchResult {
  subscriptionId: string | null;
  confidence: number;
}

const MIN_CONFIDENCE = 0.85;
const MIN_MARGIN = 0.15;

/**
 * Only pre-selects a candidate when it's both confident (>=85%) AND clearly
 * ahead of the runner-up (>=15pp) — a company with two similarly-named
 * subscriptions is exactly the case where a bare top-score pick fails
 * (spec 4.1b's "The Locked Library" vs "...: Villains Edition" example).
 * A single subscription is always an unambiguous match.
 */
export function matchSubscription(candidates: SubscriptionCandidate[], target: string | undefined): SubscriptionMatchResult {
  if (candidates.length === 0) return { subscriptionId: null, confidence: 0 };
  if (candidates.length === 1) return { subscriptionId: candidates[0].id, confidence: 1 };
  if (!target) return { subscriptionId: null, confidence: 0 };

  const scored = candidates
    .map((c) => ({ ...c, score: diceCoefficient(c.name, target) }))
    .sort((a, b) => b.score - a.score);

  const [top, runnerUp] = scored;
  const margin = runnerUp ? top.score - runnerUp.score : top.score;

  if (top.score >= MIN_CONFIDENCE && margin >= MIN_MARGIN) {
    return { subscriptionId: top.id, confidence: top.score };
  }
  return { subscriptionId: null, confidence: top.score };
}
