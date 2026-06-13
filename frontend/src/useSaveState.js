import { useEffect, useRef, useState } from 'react';

// Wraps an async save: exposes `saving` (in-flight) and `saved` (a brief
// success flash), and `run(fn)` which toggles them. Errors propagate so the
// caller's own try/catch still sets its error message.
export default function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef();

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async (fn) => {
    setSaving(true);
    try {
      const result = await fn();
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 1800);
      return result;
    } finally {
      setSaving(false);
    }
  };

  return { saving, saved, run };
}
