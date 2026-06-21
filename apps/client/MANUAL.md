# Manual play-through checklist

Automated coverage lives in the engine scenarios and the server WS tests. These steps
verify the browser join flow that can't be asserted headlessly.

## Run locally (dev)

```bash
npm run dev:server         # server on :8787 (HTTP lobby + /ws)
npm run dev:client         # Vite client on :5173 (proxies /api and /ws to the server)
```

Create a game:

```bash
curl -s -XPOST localhost:5173/api/games -H 'content-type: application/json' \
  -d '{"playerCount":3}' | jq
```

This returns three seat links of the form `http://localhost:5173/play?g=<id>&t=<token>`.

## M12 — join-link flow

- [ ] Open two of the seat links in two browser tabs → each binds to a **distinct** seat
      (the status strip shows "seat-X (you)") and both show the **same** live game.
- [ ] The status strip indicates whose turn it is; a seat that has not opened its link shows
      as `[offline]` and the strip reads "Waiting for seat-N…".
- [ ] Refresh a tab → it reloads the **current** snapshot (no start button; play continues).

## M13 — taking a turn

- [ ] On your turn the UI offers exactly the actions in `legalActions` (and no others).
- [ ] Completing a full Phase 1 amoeba turn (move/drift, then feed) advances the snapshot.

## M14 — full game

- [ ] Three seats play to `game_over`; the winner is shown; at least one buy, one division,
      one death, and one scoring advance are observed during play.
