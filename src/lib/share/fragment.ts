/**
 * Where a shared plan rides in a URL, kept apart from the codec that reads it.
 *
 * The app has to answer "is there a plan in this URL?" on every single load, and the
 * answer is almost always no. Keeping the question in a module of its own — no codec, no
 * compression library — means the machinery to decode a plan is fetched only by the rare
 * visit that actually carries one.
 */

/** The fragment parameter a report's QR code points at: `…/#plan=<payload>`. */
export const PLAN_FRAGMENT_KEY = 'plan';

/** The payload in a URL fragment (`#plan=…`), or null when there is none. */
export function planFromFragment(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (fragment === '') return null;
  const payload = new URLSearchParams(fragment).get(PLAN_FRAGMENT_KEY);
  return payload && payload !== '' ? payload : null;
}
