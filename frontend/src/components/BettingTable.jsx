const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const CHIP_DENOMINATIONS = [1, 5, 10, 25, 50];

export function BettingTable({
  placedBets,
  onPlaceChip,
  onClearAll,
  selectedChip,
  onSelectChip,
  disabled,
  winningNumber,
  onUndo,
  canUndo,
}) {
  function chipFor(key) {
    const bet = placedBets[key];
    return bet ? (
      <span className="table-chip mono" aria-hidden="true">
        {bet.stakeCents % 100 === 0 ? bet.stakeCents / 100 : (bet.stakeCents / 100).toFixed(2)}
      </span>
    ) : null;
  }
  function numberButton(n) {
    const color = n === 0 ? 'zero' : RED_NUMBERS.has(n) ? 'red' : 'black';
    return (
      <button
        key={n}
        className={`table-cell table-cell-${color} ${winningNumber === n ? 'table-cell-winner' : ''}`}
        style={
          n
            ? { '--number-row': ((n - 1) % 3) + 1, '--number-column': Math.floor((n - 1) / 3) + 1 }
            : undefined
        }
        onClick={() => onPlaceChip(`straight-${n}`, { type: 'straight', value: n })}
        disabled={disabled}
        title={
          placedBets[`straight-${n}`]
            ? `Apostado: S/ ${(placedBets[`straight-${n}`].stakeCents / 100).toFixed(2)}`
            : undefined
        }
      >
        {n}
        {chipFor(`straight-${n}`)}
      </button>
    );
  }
  const outside = [
    ['low', '1–18'],
    ['even', 'Par'],
    ['red', 'Rojo'],
    ['black', 'Negro'],
    ['odd', 'Impar'],
    ['high', '19–36'],
  ];
  return (
    <div className="roulette-betting-surface">
      <div className="roulette-bet-heading">
        <div>
          <span className="slot-edition">TU JUGADA</span>
          <h3>Coloca tus fichas</h3>
        </div>
        <span className="roulette-chip-hint">Ficha de S/{selectedChip}</span>
      </div>
      <div className="chip-tray" role="group" aria-label="Valor de la ficha">
        {CHIP_DENOMINATIONS.map((value) => (
          <button
            key={value}
            className={`chip-select ${selectedChip === value ? 'selected' : ''}`}
            aria-pressed={selectedChip === value}
            onClick={() => onSelectChip(value)}
            disabled={disabled}
          >
            S/{value}
          </button>
        ))}
        <div className="roulette-table-tools">
          <button className="btn-ghost" onClick={onUndo} disabled={disabled || !canUndo}>
            Deshacer
          </button>
          <button
            className="btn-ghost chip-tray-clear"
            onClick={onClearAll}
            disabled={disabled || !Object.keys(placedBets).length}
          >
            Limpiar mesa
          </button>
        </div>
      </div>
      <div className="roulette-table">
        <div className="roulette-zero">{numberButton(0)}</div>
        <div className="table-grid roulette-number-grid">
          {Array.from({ length: 36 }, (_, index) => numberButton(index + 1))}
        </div>
      </div>
      <div className="table-outside-row">
        {[1, 2, 3].map((column) => (
          <button
            key={column}
            className="table-cell table-cell-outside"
            onClick={() => onPlaceChip(`column-${column}`, { type: 'column', value: column })}
            disabled={disabled}
          >
            {column}.ª columna <small>2:1</small>
            {chipFor(`column-${column}`)}
          </button>
        ))}
      </div>
      <div className="table-outside-row">
        {[1, 2, 3].map((dozen) => (
          <button
            key={dozen}
            className="table-cell table-cell-outside"
            onClick={() => onPlaceChip(`dozen-${dozen}`, { type: 'dozen', value: dozen })}
            disabled={disabled}
          >
            {dozen === 1 ? '1ra docena' : dozen === 2 ? '2da docena' : '3ra docena'}{' '}
            <small>2:1</small>
            {chipFor(`dozen-${dozen}`)}
          </button>
        ))}
      </div>
      <div className="table-outside-row roulette-outside-even">
        {outside.map(([type, label]) => (
          <button
            key={type}
            className={`table-cell table-cell-outside ${type === 'red' ? 'table-cell-red' : type === 'black' ? 'table-cell-black' : ''}`}
            onClick={() => onPlaceChip(type, { type })}
            disabled={disabled}
          >
            {label}
            {chipFor(type)}
          </button>
        ))}
      </div>
    </div>
  );
}
