// Long plan text collapsed behind its first line.
export default function TaskNotes({ notes }) {
  if (!notes) return null;
  const [first] = notes.split('\n');
  return (
    <details className="sub" style={{ marginTop: 4 }}>
      <summary>{first}</summary>
      <div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{notes.slice(first.length).trim()}</div>
    </details>
  );
}
