#!/usr/bin/env python3
"""Mutation harness for Task 10.

Applies one textual mutation, runs the App suite, records whether it was caught,
and reverts. A survivor is an assertion that would pass against broken wiring —
either a real coverage hole, or a condition that cannot change an outcome (which
the report has to say out loud rather than leave to a green tick).

Usage: python3 scripts/task10-mutate.py [--only NAME]
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "App.tsx"
HOOK = ROOT / "src" / "game" / "useGame.ts"
ENGINE = ROOT / "src" / "engine" / "useEngine.ts"
CMD = ["npx", "vitest", "run", "src/App.test.tsx"]

# (name, file, old, new)
MUTATIONS = [
    # --- the eval bar: amendment 4 says there is no sign flip in App.tsx ------
    ("eval-hardcodes-white", APP,
     "sideToMove={g.game.turn()}", "sideToMove={'w'}"),
    ("eval-reads-a-stale-turn", APP,
     "sideToMove={g.game.turn()}", "sideToMove={'b'}"),
    ("eval-drops-the-score", APP,
     "sideToMoveCp={g.analysis?.scoreCp}\n            sideToMoveMate={g.analysis?.scoreMate}",
     "sideToMoveCp={undefined}\n            sideToMoveMate={undefined}"),
    ("eval-restores-the-brief-flip", APP,
     "sideToMoveCp={g.analysis?.scoreCp}",
     "sideToMoveCp={g.game.turn() === 'w' ? g.analysis?.scoreCp : -(g.analysis?.scoreCp ?? 0)}"),
    # --- the brief's canUndo, which is zero exactly when it is needed ---------
    ("undo-uses-the-future-length", APP,
     "canUndo={g.snapshot.cursor > 0}",
     "canUndo={g.snapshot.moves.length - g.snapshot.cursor > 0}"),
    # --- the brief's playerTurn, which freezes the board in two-player mode ---
    ("board-uses-playerTurn", APP, "interactive={g.canMove}", "interactive={g.playerTurn}"),
    ("canMove-ignores-engine-death", HOOK,
     "const canMove = playable && (engineDisabled || learnerToMove);",
     "const canMove = playable && learnerToMove;"),
    ("hint-stays-enabled-without-an-engine", APP,
     "disabled={!g.playerTurn || g.hintBusy || engineUnavailable}",
     "disabled={!g.playerTurn || g.hintBusy}"),
    # --- Captured must be given the replayed position, never a FEN -----------
    ("captured-gets-a-fen-position", APP,
     "<Captured game={g.game} />", "<Captured game={new Chess(g.game.fen())} />"),
    # --- the opponent's reply ----------------------------------------------
    ("reply-ignores-gameOver", HOOK,
     "if (!playable || learnerToMove || snapshot.moves.length === 0) return;",
     "if (reviewing || learnerToMove || snapshot.moves.length === 0) return;"),
    ("reply-drops-the-empty-board-guard", HOOK,
     "if (!playable || learnerToMove || snapshot.moves.length === 0) return;",
     "if (!playable || learnerToMove) return;"),
    ("reply-answers-without-waiting", HOOK,
     "await sleep(thinkWaitMs(performance.now() - started, settingsRef.current.minThinkTimeMs));",
     "await sleep(0);"),
    ("reply-ignores-the-think-time-setting", HOOK,
     "thinkWaitMs(performance.now() - started, settingsRef.current.minThinkTimeMs)",
     "Math.max(performance.now() - started, 500)"),
    # --- the evaluation ----------------------------------------------------
    ("eval-ignores-replyDue", HOOK,
     "if (!engineAvailable || engineDisabled || gameOver || replyDue) return;",
     "if (!engineAvailable || engineDisabled || gameOver) return;"),
    ("eval-ignores-gameOver", HOOK,
     "if (!engineAvailable || engineDisabled || gameOver || replyDue) return;",
     "if (!engineAvailable || engineDisabled || replyDue) return;"),
    ("eval-drops-the-position-check", HOOK,
     "if (fenRef.current === fen) setAnalysis(a);", "setAnalysis(a);"),
    # --- the hint path -----------------------------------------------------
    ("hint-ignores-the-turn", HOOK,
     "    if (engineDisabled || !engineAvailable) return;\n    if (!playerTurn) return;",
     "    if (engineDisabled || !engineAvailable) return;"),
    ("hint-drops-the-position-check", HOOK,
     "if (fenRef.current !== asked) return;", "if (false) return;"),
    ("hint-drops-the-in-flight-guard", HOOK,
     "if (hintInFlightRef.current) return;", "if (false) return;"),
    # --- the door: one search at a time, a move ahead of an evaluation -------
    ("engine-lets-searches-overlap", ENGINE,
     "analyze: (fen, opts) => enqueue(() => source.analyze(fen, opts), false),",
     "analyze: (fen, opts) => source.analyze(fen, opts),"),
    ("engine-queues-a-move-behind-the-bar", ENGINE,
     "enqueue(async () => (await client.search(fen, { movetimeMs })).bestMove, true)",
     "enqueue(async () => (await client.search(fen, { movetimeMs })).bestMove, false)"),
    # --- persistence -------------------------------------------------------
    ("persistence-wipes-a-resignation", HOOK,
     "if (snapshot.moves.length === 0 && snapshot.resignedBy === null) {",
     "if (snapshot.moves.length === 0) {"),
    ("hydrate-early-returns-on-no-moves", HOOK,
     "const stored = loadGame();\n  if (stored === null) return initialState();",
     "const stored = loadGame();\n  if (stored === null || stored.moves.length === 0) return initialState();"),
    ("settings-never-reach-the-engine", HOOK,
     "}, [engineAvailable, settings.skillLevel]);", "}, []);"),
    # --- the engine hook: the client is built in an effect, not a ref -------
    ("engine-holds-the-client-in-a-ref", ENGINE,
     """  const [client, setClient] = useState<EngineClient | null>(null);
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setStatus('error');
      setError(new EngineError('worker-died', NO_WORKERS));
      return;
    }
    const created = new EngineClient();
    setClient(created);
    const off = created.onStatus((next) => {
      setStatus(next);
      // Cleared on the way out of `error` as well as set on the way in: a
      // recovered client nulls its own cause, so keeping it would put a stale
      // failure message next to a healthy badge.
      setError(next === 'error' ? created.error : null);
    });
    return () => {
      // Unsubscribe before disposing, so the dead client's terminal `idle` can
      // never overwrite the state of the one replacing it.
      off();
      created.dispose();
      setClient(null);
    };
  }, []);""",
     """  const ref = useRef<EngineClient | null>(null);
  if (ref.current === null && typeof Worker !== 'undefined') ref.current = new EngineClient();
  const client = ref.current;
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (client === null) {
      setStatus('error');
      setError(new EngineError('worker-died', NO_WORKERS));
      return;
    }
    const off = client.onStatus((next) => {
      setStatus(next);
      setError(next === 'error' ? client.error : null);
    });
    return () => {
      off();
      client.dispose();
    };
  }, []);"""),
    ("engine-swallows-a-missing-worker", ENGINE,
     "    if (typeof Worker === 'undefined') {\n      setStatus('error');\n      setError(new EngineError('worker-died', NO_WORKERS));\n      return;\n    }",
     "    if (typeof Worker === 'undefined') return;"),
    ("engine-keeps-a-stale-error", ENGINE,
     "setError(next === 'error' ? created.error : null);", "if (next === 'error') setError(created.error);"),
]


def run():
    proc = subprocess.run(CMD, cwd=ROOT, capture_output=True, text=True)
    tail = [ln for ln in proc.stdout.splitlines() if "Tests " in ln]
    return proc.returncode, (tail[-1] if tail else proc.stdout[-400:])


def main() -> None:
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]

    code, tail = run()
    print(f"baseline: exit={code} {tail.strip()}")
    if code != 0:
        print("baseline is not green; fix that first")
        return

    survivors, caught, notes = [], [], []
    for name, path, old, new in MUTATIONS:
        if only and only not in name:
            continue
        source = path.read_text()
        if source.count(old) != 1:
            notes.append(f"{name}: anchor found {source.count(old)} times in {path.name}")
            print(f"ANCHOR   {name}")
            continue
        try:
            path.write_text(source.replace(old, new))
            code, tail = run()
        finally:
            path.write_text(source)
        if code != 0:
            caught.append(name)
            print(f"caught   {name}")
        else:
            survivors.append(name)
            print(f"SURVIVED {name}  ({tail.strip()})")

    total = len(caught) + len(survivors)
    print()
    print(f"caught {len(caught)} / {total}")
    for name in survivors:
        print(f"  survivor: {name}")
    for note in notes:
        print(f"  note: {note}")


if __name__ == "__main__":
    main()
