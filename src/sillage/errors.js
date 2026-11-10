/** Errors a caller can act on without reading the source: a stable `code`,
 * a message that names the offending value, and a `hint` that says what to
 * send instead. The CLI and the MCP server print them as JSON. */
export class SillageError extends Error {
  constructor(code, message, {hint = null, details = null} = {}) {
    super(message);
    this.name = 'SillageError';
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
  toJSON() {
    return {code: this.code, message: this.message, ...(this.hint ? {hint: this.hint} : {}), ...(this.details ? {details: this.details} : {})};
  }
}

/** Every error leaves the API in this shape, whatever threw it. */
export function errorJSON(error) {
  if (error instanceof SillageError) return error.toJSON();
  return {code: 'INTERNAL', message: String(error?.message ?? error)};
}

function distance(a, b) {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** The candidates closest to a mistyped name, nearest first. */
export function suggest(input, candidates, max = 3) {
  const needle = String(input).toLowerCase();
  return candidates
    .map(candidate => {
      const name = String(candidate).toLowerCase();
      const contained = name.includes(needle) || needle.includes(name);
      return {candidate, score: contained ? 0 : distance(needle, name) / Math.max(needle.length, name.length)};
    })
    .filter(entry => entry.score <= .5)
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map(entry => entry.candidate);
}

/** "Did you mean a, b?" or a short list of what exists. */
export function didYouMean(input, candidates, noun = 'one of') {
  const near = suggest(input, candidates);
  if (near.length) return `Did you mean ${near.map(name => `"${name}"`).join(' or ')}?`;
  const shown = candidates.slice(0, 12).map(name => `"${name}"`).join(', ');
  return `Use ${noun}: ${shown}${candidates.length > 12 ? `, ... (${candidates.length} in all)` : ''}.`;
}
