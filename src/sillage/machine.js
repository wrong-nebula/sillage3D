/** A life cycle written down: named states and, for each, the states it can
 * move to. The page API, the viewer page and the headless session each keep
 * one, so "what state is this in, and what can it do next" has one answer
 * that code, people and agents all read the same way.
 *
 *   const life = createMachine('Door', 'closed', {closed: ['open'], open: ['closed']});
 *   life.state;          // 'closed'
 *   life.can('open');    // true
 *   life.go('open');     // true: it moved. false: it was already there.
 *   life.is('open', 'ajar');
 *
 * A move the table does not list is a bug in the caller, not bad input: `go`
 * throws INVALID_STATE naming both states and the moves that are allowed. */
import {SillageError} from './errors.js';

/** A `Sillage` (src/sillage/index.js): each state, and the states it can move to.
 * empty: no scene yet. loading: a load is in flight. ready: a scene is loaded.
 * lost: the GPU context is gone. disposed: dispose() was called. */
export const SILLAGE_STATES = {
  empty: ['loading', 'lost', 'disposed'],
  loading: ['ready', 'empty', 'lost', 'disposed'],
  ready: ['loading', 'lost', 'disposed'],
  lost: ['disposed'],
  disposed: [],
};
/** The /sillage.html page (src/sillage/host.js). booting: starting. ready: it
 * answers calls. failed: it could not start, or lost its GPU context. */
export const HOST_STATES = {
  booting: ['ready', 'failed'],
  ready: ['failed'],
  failed: [],
};
/** A headless `Session` (cli/lib/session.mjs). closed: nothing is running.
 * opening: server, browser and page are starting. open: calls work.
 * broken: the page stalled, crashed or lost its GPU context. */
export const SESSION_STATES = {
  closed: ['opening'],
  opening: ['open', 'closed'],
  open: ['broken', 'closed'],
  broken: ['closed'],
};

/** @param {string} name  What the machine describes, for error messages.
 * @param {string} initial
 * @param {Record<string, string[]>} moves  Each state, and the states it can move to.
 * @param {(state: string, previous: string) => void} [onChange]  Called after every move. */
export function createMachine(name, initial, moves, onChange = null) {
  for (const [from, targets] of Object.entries(moves)) for (const to of targets) if (!(to in moves)) throw new Error(`${name}: "${from}" moves to "${to}", which is not a state.`);
  if (!(initial in moves)) throw new Error(`${name}: the initial state "${initial}" is not a state.`);
  let state = initial;
  return {
    get state() { return state; },
    is: (...states) => states.includes(state),
    can: next => moves[state].includes(next),
    go(next) {
      if (next === state) return false;
      if (!moves[state].includes(next)) throw new SillageError('INVALID_STATE', `${name} cannot go from "${state}" to "${next}".`, {hint: moves[state].length ? `From "${state}" it can go to: ${moves[state].map(to => `"${to}"`).join(', ')}.` : `"${state}" is final.`});
      const previous = state;
      state = next;
      onChange?.(state, previous);
      return true;
    },
  };
}
