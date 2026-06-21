// Environment card (compass) and a compact scoring ladder.

import type { GameState } from '@ps/shared';
import { FINISH_ZONE_START, LADDER_MAX } from '@ps/shared';
import { COLOR_HEX } from '../format.js';

export function EnvCardView(props: { game: GameState }): JSX.Element {
  const c = props.game.environment.current;
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
      <h3 style={{ margin: '0 0 6px' }}>Environment</h3>
      <div>Card: {c.id}</div>
      <div>Ozone: {c.ozoneThickness}</div>
      <div>Drift: {c.drift}</div>
      <div style={{ color: '#888', fontSize: 12 }}>{props.game.environment.deckRemaining.length} cards left in deck</div>
    </div>
  );
}

export function Ladder(props: { game: GameState }): JSX.Element {
  const { game } = props;
  const sorted = [...game.seatOrder].sort((a, b) => game.players[b]!.score - game.players[a]!.score);
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
      <h3 style={{ margin: '0 0 6px' }}>Scoring ladder (finish ≥ {FINISH_ZONE_START} of {LADDER_MAX})</h3>
      {sorted.map((seat) => {
        const p = game.players[seat]!;
        return (
          <div key={seat} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_HEX[p.color] }} />
            <span style={{ width: 60 }}>{seat}</span>
            <div style={{ flex: 1, background: '#eee', height: 8, borderRadius: 4 }}>
              <div style={{ width: `${(Math.min(p.score, LADDER_MAX) / LADDER_MAX) * 100}%`, height: 8, background: COLOR_HEX[p.color], borderRadius: 4 }} />
            </div>
            <span style={{ width: 24, textAlign: 'right' }}>{p.score}</span>
          </div>
        );
      })}
    </div>
  );
}
