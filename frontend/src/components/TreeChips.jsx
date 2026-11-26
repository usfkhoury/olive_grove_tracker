// Toggleable tree chips. Empty selection = whole grove.
export default function TreeChips({ trees, selected, onChange }) {
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]);
  return (
    <label className="field">
      Trees — leave empty for the whole grove
      <div>
        {trees.filter((t) => t.status === 'active').map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              type="button"
              key={t.id}
              className="chip"
              style={{
                border: 0,
                cursor: 'pointer',
                background: on ? 'var(--olive)' : undefined,
                color: on ? '#fff' : undefined,
              }}
              onClick={() => toggle(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </label>
  );
}
