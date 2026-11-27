import { useState } from 'react';
import { GLOSSARY } from '../constants.js';

// Small ⓘ that toggles a plain-language explanation of a grove term.
export default function Info({ term }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="info-btn" aria-label={`What does ${term} mean?`} onClick={() => setOpen(!open)}>ⓘ</button>
      {open && <span className="info-text" onClick={() => setOpen(false)}>{GLOSSARY[term]}</span>}
    </>
  );
}
