export default function SuggestionChips({ items, onPick }) {
  if (!items?.length) return null;
  return (
    <div className="followups enter enter-3">
      <p className="micro">Continue from here</p>
      <div className="chips" role="list">
        {items.map((label) => (
          <button key={label} type="button" className="chip" onClick={() => onPick(label)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
