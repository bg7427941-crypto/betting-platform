const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function numberColor(n) {
  if (n === 0) return 'zero';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// tres filas x doce columnas: fila 1 = 1,4,7...34 · fila 2 = 2,5,8...35 · fila 3 = 3,6,9...36
const ROWS = [0, 1, 2].map((row) =>
  Array.from({ length: 12 }, (_, col) => col * 3 + row + 1)
);

const CHIP_DENOMINATIONS = [1, 5, 10, 25, 50];

/**
 * placedBets: { [key]: { type, value, stakeCents } }
 * key = 'straight-17' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high'
 *     | 'dozen-1'..'dozen-3' | 'column-1'..'column-3'
 */
export function BettingTable({
  placedBets,
  onPlaceChip,
  onClearAll,
  selectedChip,
  onSelectChip,
  disabled,
  winningNumber,
}) {
  function chipFor(key) {
    const bet = placedBets[key];
    if (!bet) return null;
    return (
      <span className="table-chip mono">
        {bet.stakeCents % 100 === 0 ? bet.stakeCents / 100 : (bet.stakeCents / 100).toFixed(2)}
      </span>
    );
  }

  function cellClass(n) {
    const base = `table-cell table-cell-${numberColor(n)}`;
    const highlighted = winningNumber === n ? ' table-cell-winner' : '';
    return base + highlighted;
  }

  return (
    <div>
      <div className="chip-tray">
        {CHIP_DENOMINATIONS.map((v) => (
          <button
            key={v}
            className={`chip-select ${selectedChip === v ? 'selected' : ''}`}
            onClick={() => onSelectChip(v)}
            disabled={disabled}
          >
            S/{v}
          </button>
        ))}
        <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={onClearAll} disabled={disabled}>
          Limpiar mesa
        </button>
      </div>

      <div className="roulette-table">
        <button
          className={`table-cell table-cell-zero table-cell-zero-span ${winningNumber === 0 ? 'table-cell-winner' : ''}`}
          onClick={() => onPlaceChip('straight-0', { type: 'straight', value: 0 })}
          disabled={disabled}
        >
          0
          {chipFor('straight-0')}
        </button>

        <div className="table-grid">
          {ROWS.map((row, i) => (
            <div className="table-row" key={i}>
              {row.map((n) => (
                <button
                  key={n}
                  className={cellClass(n)}
                  onClick={() => onPlaceChip(`straight-${n}`, { type: 'straight', value: n })}
                  disabled={disabled}
                >
                  {n}
                  {chipFor(`straight-${n}`)}
                </button>
              ))}
              <button
                className="table-cell table-cell-outside"
                onClick={() => onPlaceChip(`column-${3 - i}`, { type: 'column', value: 3 - i })}
                disabled={disabled}
              >
                2 a 1
                {chipFor(`column-${3 - i}`)}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="table-outside-row">
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            className="table-cell table-cell-outside table-cell-wide"
            onClick={() => onPlaceChip(`dozen-${d}`, { type: 'dozen', value: d })}
            disabled={disabled}
          >
            {d === 1 ? '1ra docena' : d === 2 ? '2da docena' : '3ra docena'}
            {chipFor(`dozen-${d}`)}
          </button>
        ))}
      </div>

      <div className="table-outside-row">
        <button className="table-cell table-cell-outside" onClick={() => onPlaceChip('low', { type: 'low' })} disabled={disabled}>
          1–18{chipFor('low')}
        </button>
        <button className="table-cell table-cell-outside" onClick={() => onPlaceChip('even', { type: 'even' })} disabled={disabled}>
          Par{chipFor('even')}
        </button>
        <button
          className="table-cell table-cell-outside table-cell-red"
          onClick={() => onPlaceChip('red', { type: 'red' })}
          disabled={disabled}
        >
          Rojo{chipFor('red')}
        </button>
        <button
          className="table-cell table-cell-outside table-cell-black"
          onClick={() => onPlaceChip('black', { type: 'black' })}
          disabled={disabled}
        >
          Negro{chipFor('black')}
        </button>
        <button className="table-cell table-cell-outside" onClick={() => onPlaceChip('odd', { type: 'odd' })} disabled={disabled}>
          Impar{chipFor('odd')}
        </button>
        <button className="table-cell table-cell-outside" onClick={() => onPlaceChip('high', { type: 'high' })} disabled={disabled}>
          19–36{chipFor('high')}
        </button>
      </div>
    </div>
  );
}
