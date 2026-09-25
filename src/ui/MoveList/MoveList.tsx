import './MoveList.css';

export interface MoveListProps {
  /**
   * The move list, oldest first.
   *
   * Typed to the narrowest shape that works rather than to `Move[]`, so
   * `GameSnapshot.moves` can be passed straight through without a copy: a `Move`
   * is a `Move & { san: string }` here, and the panel reads nothing else.
   */
  moves: Array<{ san: string }>;
  /** How many moves are in the displayed position, 0..moves.length. Same
   *  coordinate as `onGoto`, so the two cannot disagree. */
  cursor: number;
  /** Asked to show the position *after* the given ply. 1-based: ply 1 is White's
   *  first move. `GameSnapshot.cursor` uses the same numbering, so this is a
   *  pass-through. */
  onGoto: (cursor: number) => void;
}

/** One move-numbered row: a number, and the one or two moves played in it. */
interface MoveRow {
  n: number;
  white: { san: string; ply: number };
  black?: { san: string; ply: number };
}

/** Moves in pairs, each carrying the ply it is at.
 *
 *  Ply is 1-based and derived from the index, never from the move number: the
 *  first White move is ply 1 and the second Black move of the game is ply 4, and
 *  the two numbering schemes agree only on the very first move — which is the one
 *  place a test that clicks only `e4` can tell. */
function rowsOf(moves: Array<{ san: string }>): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i];
    // Unreachable: `i < moves.length` and no element is removed. Checked anyway,
    // because the alternative is a `!` that would claim it on a `noUncheckedIndexedAccess`
    // array and silently emit a row with no White move in it.
    if (white === undefined) continue;
    const black = moves[i + 1];
    rows.push({
      n: i / 2 + 1,
      white: { san: white.san, ply: i + 1 },
      // Omitted rather than left empty, so a half-played row does not render a
      // blank button that calls `onGoto` with a ply that does not exist.
      ...(black === undefined ? {} : { black: { san: black.san, ply: i + 2 } }),
    });
  }
  return rows;
}

export default function MoveList({ moves, cursor, onGoto }: MoveListProps) {
  if (moves.length === 0) {
    return <p className="movelist-empty">No moves yet.</p>;
  }
  return (
    <ol className="movelist" aria-label="Moves">
      {rowsOf(moves).map((r) => (
        <li key={r.n}>
          <span className="movelist-n" aria-hidden="true">
            {r.n}.
          </span>
          <MoveButton
            move={r.white}
            isCurrent={cursor === r.white.ply}
            onGoto={onGoto}
          />
          {r.black !== undefined && (
            <MoveButton move={r.black} isCurrent={cursor === r.black.ply} onGoto={onGoto} />
          )}
        </li>
      ))}
    </ol>
  );
}

/** One clickable SAN. `aria-current` is present only when this is the move on
 *  screen: `aria-current="false"` would answer "is this current?" affirmatively to
 *  a caller that checks for the attribute's presence, and a caller that checks for
 *  `"true"` would be right by accident. Absent is the only unambiguous answer. */
function MoveButton({
  move,
  isCurrent,
  onGoto,
}: {
  move: { san: string; ply: number };
  isCurrent: boolean;
  onGoto: (cursor: number) => void;
}) {
  return (
    <button
      type="button"
      className="movelist-move"
      aria-current={isCurrent || undefined}
      onClick={() => onGoto(move.ply)}
    >
      {move.san}
    </button>
  );
}
