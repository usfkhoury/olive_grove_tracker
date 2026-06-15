import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function LoginModal({ onClose }) {
  const { login } = useAuth();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(token);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box card" onClick={(e) => e.stopPropagation()}>
        <h2>Owner login</h2>
        <form onSubmit={submit}>
          <label className="field">
            Admin token
            <input
              type="password"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your OLIVE_ADMIN_TOKEN"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || !token}>
            {loading ? 'Verifying…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
