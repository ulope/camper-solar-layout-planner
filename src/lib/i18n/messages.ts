/**
 * Message catalog plumbing.
 *
 * A catalog is a flat map of dotted keys to messages. A message is either a plain
 * string or a `{ one, other }` pair chosen by the `count` parameter — the only plural
 * distinction English and German need. Placeholders are `{name}` and are substituted
 * with the parameters passed at call time; an unknown placeholder is left untouched so
 * a missing parameter is visible rather than silently blank.
 */

export type Message = string | { one: string; other: string };

export type MessageParams = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Pick the plural form of a message, if it has one. */
function pick(message: Message, params?: MessageParams): string {
  if (typeof message === 'string') return message;
  return Number(params?.count) === 1 ? message.one : message.other;
}

/** Escape the five characters that matter when a message is rendered as HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitute `{name}` placeholders. `escape` is used for the handful of messages that
 * carry their own markup and are rendered with `{@html}`: the message text is ours, but
 * the parameters may be user-entered names, so those are escaped.
 */
export function format(message: Message, params?: MessageParams, escape = false): string {
  const text = pick(message, params);
  if (!params) return text;
  return text.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return escape ? escapeHtml(String(value)) : String(value);
  });
}
