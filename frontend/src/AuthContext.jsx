import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext({ isOwner: false, loginWithGoogle: () => {}, logout: () => {} });

export function AuthProvider({ children }) {
  const [isOwner, setIsOwner] = useState(false);

  // On mount: check if the browser already has a valid session cookie.
  // isOwner starts false so the UI renders read-only immediately and
  // transitions to owner mode once this resolves — no flash of write UI.
  useEffect(() => {
    fetch('/api/auth/verify')
      .then((res) => { if (res.ok) setIsOwner(true); })
      .catch(() => {});
  }, []);

  // Exchange a Google Identity Services ID-token (JWT credential) for our own
  // session cookie. The backend verifies the token and that it belongs to the owner.
  const loginWithGoogle = useCallback(async (credential) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Login failed');
    }
    setIsOwner(true);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsOwner(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isOwner, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
