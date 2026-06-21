// Connection/status strip (architecture §12): which seats have joined, whose turn it is,
// and a "waiting for player N" state when the current actor has not connected yet.

import type { GameState, PlayerId } from '@ps/shared';

export function StatusStrip(props: { you: PlayerId | null; game: GameState | null; status: string }): JSX.Element {
  const { you, game, status } = props;
  if (!game) {
    return <div className="status-strip">Connecting… ({status})</div>;
  }

  const currentSeat = game.currentDecision?.seat ?? null;
  const currentConnected = currentSeat ? game.players[currentSeat]?.connected : false;
  const phaseLabel = game.phase.replace(/_/g, ' ');

  return (
    <div className="status-strip">
      <span>
        Round {game.round} · {phaseLabel}
      </span>
      {' · '}
      <span>
        Seats:{' '}
        {game.seatOrder.map((seat) => {
          const p = game.players[seat]!;
          const isYou = seat === you;
          const isCurrent = seat === currentSeat;
          return (
            <span key={seat} style={{ marginRight: 8, color: p.color, fontWeight: isCurrent ? 700 : 400 }}>
              {seat}
              {isYou ? ' (you)' : ''}
              {p.connected ? '' : ' [offline]'}
            </span>
          );
        })}
      </span>
      {' · '}
      {game.phase === 'game_over' ? (
        <span>Game over — winner {game.winner}</span>
      ) : currentSeat && !currentConnected ? (
        <span>Waiting for {currentSeat}…</span>
      ) : currentSeat === you ? (
        <span>Your turn</span>
      ) : (
        <span>Waiting on {currentSeat}</span>
      )}
    </div>
  );
}
