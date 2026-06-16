import { useCallback, useEffect, useRef, useState } from 'react';
import api from './api.js';
import useSaveState from './useSaveState.js';

// The shared lifecycle behind every collection page: fetch a list from `path`,
// hold it plus an error, and create/remove items (each refetches the list).
// Pages keep their own form, view logic and any auxiliary data — this owns only
// the collection's data.
//
// `onChange` (optional) runs after any successful create/remove, for pages that
// show derived data alongside the list (e.g. Oil's balance, Harvest's seasons).
// It's held in a ref so passing an inline function never re-triggers the fetch.
//
// create/remove never throw: create returns the created item or null, remove
// returns true/false, and `error` is set on failure. Pages branch on the result.
export default function useCollection(path, { onChange } = {}) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const { saving, saved, run } = useSaveState();

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const reload = useCallback(
    () => api.get(path).then(setItems).catch((e) => setError(e.message)),
    [path],
  );

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(
    async (body) => {
      setError('');
      try {
        const created = await run(() => api.post(path, body));
        await reload();
        onChangeRef.current?.();
        return created;
      } catch (e) {
        setError(e.message);
        return null;
      }
    },
    [path, reload, run],
  );

  const remove = useCallback(
    async (id) => {
      setError('');
      try {
        await api.del(`${path}/${id}`);
        await reload();
        onChangeRef.current?.();
        return true;
      } catch (e) {
        setError(e.message);
        return false;
      }
    },
    [path, reload],
  );

  return { items, error, setError, reload, create, remove, saving, saved };
}
