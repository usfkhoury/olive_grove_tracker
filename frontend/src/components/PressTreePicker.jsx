// Trees that went into one pressing. A terrace button toggles its whole row.
// `taken` maps treeId → date label of ANOTHER press this season: those trees
// are shown muted with that date; ticking one moves it to this press.
export default function PressTreePicker({ trees, selected, onChange, taken }) {
  const active = trees.filter((t) => t.status === 'active');
  const rows = [...new Set(active.map((t) => t.row))].sort((a, b) => a - b);
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const toggleRow = (row) => {
    const ids = active.filter((t) => t.row === row).map((t) => t.id);
    const all = ids.every((id) => selected.includes(id));
    onChange(all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  };

  return (
    <div className="field">
      <span>Trees in this pressing {selected.length > 0 && <b>({selected.length})</b>}</span>
      {rows.map((row) => (
        <div className="press-row" key={row}>
          <button type="button" className="chip terrace-btn" onClick={() => toggleRow(row)}>Terrace {row}</button>
          {active.filter((t) => t.row === row).map((t) => {
            const on = selected.includes(t.id);
            const other = !on && taken.get(t.id);
            return (
              <button type="button" key={t.id} onClick={() => toggle(t.id)}
                className={`chip tree-chip ${on ? 'on' : ''} ${other ? 'taken' : ''}`}
                title={other ? `In the ${other} press — tap to move it here` : t.label}>
                {t.label}{other && <small> · {other}</small>}
              </button>
            );
          })}
        </div>
      ))}
      <span className="sub" style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
        Sets each tree's press for this season. Sacks go in Trees → Sheet.
      </span>
    </div>
  );
}
