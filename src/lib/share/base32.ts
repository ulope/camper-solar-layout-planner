/**
 * Crockford-free, padding-free RFC 4648 base32 — uppercase A–Z and 2–7.
 *
 * Base64 would be the obvious choice and is 20% shorter as text, but this text ends up in
 * a QR code, where the *encoding mode* decides the real cost: base32's alphabet is a
 * subset of QR's alphanumeric mode at 5.5 bits per character, while base64 needs byte
 * mode at 8. Per source byte that is 8.8 bits against 10.67 — base32 wins by about 18%,
 * which is a QR version or two on a real plan.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Reverse lookup, built once. Lowercase decodes too, so a retyped code still works. */
const VALUES = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  VALUES.set(ALPHABET[i], i);
  VALUES.set(ALPHABET[i].toLowerCase(), i);
}

export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  // The trailing partial group is padded with zero bits rather than '=' characters:
  // the decoder knows to drop them, and every '=' would cost a QR character.
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decode base32, or null when the text holds a character outside the alphabet. */
export function fromBase32(text: string): Uint8Array | null {
  const out = new Uint8Array(Math.floor((text.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const ch of text) {
    const digit = VALUES.get(ch);
    if (digit === undefined) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      out[at++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return out.subarray(0, at);
}
