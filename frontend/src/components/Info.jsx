import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '../constants.js';

const TITLES = {
  ratio: 'Ratio', tanake: 'Tanake', ripeness: 'Ripeness (Jaén 0–7)', sacks: 'Sacks', adjustment: 'Stock adjustment',
};
const W = 270; // popover width, px

// "Intro: a · b · c. Tail" → intro, list rows, tail. Plain text otherwise.
function Body({ text }) {
  const colon = text.indexOf(': ');
  if (colon < 0 || !text.includes(' · ')) return <div className="info-pop-body">{text}</div>;
  const items = text.slice(colon + 2).split(' · ');
  const last = items.pop();
  const dot = last.indexOf('. ');
  items.push(dot < 0 ? last.replace(/\.$/, '') : last.slice(0, dot));
  const tail = dot < 0 ? '' : last.slice(dot + 2);
  return (
    <div className="info-pop-body">
      <div>{text.slice(0, colon)}:</div>
      <ul className="info-pop-list">
        {items.map((it) => {
          const n = /^(\d+(?:\.\d+)?)\s(.*)$/.exec(it);
          return (
            <li key={it}>
              {n ? <><b>{n[1]}</b> {n[2]}</> : it}
            </li>
          );
        })}
      </ul>
      {tail && <div className="info-pop-tail">{tail}</div>}
    </div>
  );
}
const GAP = 8;

// Small ⓘ with a plain-language explanation of a grove term.
// Hover (mouse) or tap (touch) opens it; tap again, tap outside or Esc closes.
// Rendered in a portal with fixed positioning so scrolling tables can't clip it.
export default function Info({ term }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // opened by click/tap: ignore mouseleave
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  const id = useId();

  const close = useCallback(() => { setOpen(false); setPinned(false); }, []);

  // Place below the icon (above if no room), clamped to the viewport.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current.getBoundingClientRect();
      const h = pop.current ? pop.current.offsetHeight : 120;
      const vw = window.innerWidth;
      const left = Math.max(8, Math.min(vw - W - 8, r.left + r.width / 2 - W / 2));
      const below = r.bottom + GAP + h <= window.innerHeight - 8;
      setPos({
        left,
        top: below ? r.bottom + GAP : r.top - GAP - h,
        arrow: Math.max(12, Math.min(W - 12, r.left + r.width / 2 - left)),
        below,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!btn.current?.contains(e.target) && !pop.current?.contains(e.target)) close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const hover = (e) => e.pointerType === 'mouse';

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`info-btn ${open ? 'on' : ''}`}
        aria-label={`What does ${TITLES[term] || term} mean?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(e) => { if (hover(e)) setOpen(true); }}
        onPointerLeave={(e) => { if (hover(e) && !pinned) setOpen(false); }}
        onClick={(e) => {
          e.preventDefault(); // inside <label>: don't focus the input
          e.stopPropagation();
          if (pinned) close(); else { setOpen(true); setPinned(true); }
        }}
      >
        i
      </button>
      {open && createPortal(
        <div
          ref={pop}
          id={id}
          role="tooltip"
          className={`info-pop ${pos?.below === false ? 'above' : 'below'}`}
          style={{ width: W, left: pos?.left ?? -9999, top: pos?.top ?? -9999, '--arrow': `${pos?.arrow ?? W / 2}px` }}
          onPointerEnter={(e) => { if (hover(e)) setOpen(true); }}
          onPointerLeave={(e) => { if (hover(e) && !pinned) setOpen(false); }}
        >
          <div className="info-pop-title">{TITLES[term] || term}</div>
          <Body text={GLOSSARY[term] || ''} />
        </div>,
        document.body,
      )}
    </>
  );
}
