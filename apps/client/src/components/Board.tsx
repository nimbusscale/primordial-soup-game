// The 24-space soup: per-cell per-color cube counts and amoebas (with DP), plus the
// central island. Cube display style is a UI choice (spec §3a) — colored chips here.

import type { CSSProperties } from 'react';
import type { Amoeba, Color, GameState, PlayerId } from '@ps/shared';
import { COLOR_HEX } from '../format.js';

const ISLAND = '2,2';

function occupantsAt(game: GameState, cellId: string): Array<{ seat: PlayerId; amoeba: Amoeba }> {
  const out: Array<{ seat: PlayerId; amoeba: Amoeba }> = [];
  for (const seat of game.seatOrder) {
    for (const a of game.players[seat]!.amoebas) {
      if (a.location === cellId) out.push({ seat, amoeba: a });
    }
  }
  return out;
}

function Cell(props: { game: GameState; col: number; row: number }): JSX.Element {
  const { game, col, row } = props;
  const id = `${col},${row}`;
  if (id === ISLAND) {
    return <div style={{ ...cellStyle, background: '#cdb892', display: 'grid', placeItems: 'center', color: '#5b4a2a' }}>Island</div>;
  }
  const cell = game.board[id];
  const cubes = cell?.cubes ?? {};
  const occupants = occupantsAt(game, id);
  return (
    <div style={cellStyle}>
      <div style={{ fontSize: 10, color: '#888' }}>{id}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {(Object.keys(cubes) as Color[])
          .filter((c) => (cubes[c] ?? 0) > 0)
          .map((c) => (
            <span key={c} style={{ background: COLOR_HEX[c], color: '#fff', borderRadius: 3, padding: '0 4px', fontSize: 11 }}>
              {cubes[c]}
            </span>
          ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
        {occupants.map(({ seat, amoeba }) => (
          <span
            key={`${seat}-${amoeba.id}`}
            title={`${seat} amoeba ${amoeba.id} (DP ${amoeba.dp})`}
            style={{
              background: COLOR_HEX[game.players[seat]!.color],
              color: '#fff',
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'grid',
              placeItems: 'center',
              fontSize: 10,
            }}
          >
            {amoeba.id}
            {amoeba.dp > 0 ? `·${amoeba.dp}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

const cellStyle: CSSProperties = {
  border: '1px solid #ccc',
  minHeight: 64,
  padding: 4,
  background: '#f6fbff',
};

export function Board(props: { game: GameState }): JSX.Element {
  const { game } = props;
  const rows = [0, 1, 2, 3, 4];
  const cols = [0, 1, 2, 3, 4];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 84px)', gap: 2 }}>
      {rows.map((row) => cols.map((col) => <Cell key={`${col},${row}`} game={game} col={col} row={row} />))}
    </div>
  );
}
