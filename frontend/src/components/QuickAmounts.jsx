export default function QuickAmounts({ value, onPick, amounts = [10, 20, 50, 100], disabled = false }) {
  return (
    <div className="quick-amounts" role="group" aria-label="Montos rápidos">
      {amounts.map((amount) => {
        const active = Number(value) === amount;
        return (
          <button
            key={amount}
            type="button"
            className={`chip-amount${active ? ' active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onPick(String(amount))}
          >
            S/ {amount}
          </button>
        );
      })}
    </div>
  );
}
