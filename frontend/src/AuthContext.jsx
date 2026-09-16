import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Owner sign-in state. The Google ID token lives in localStorage and rides on
// every mutating request as `Authorization: Bearer <token>`. No cookies, no
// session on the server — the function verifies the token on each write.
const TOKEN_KEY = 'olive_google_id_token';

const AuthContext = createContext({
  isOwner: false,
  token: null,
  loginWithGoogle: () => {},
  logout: () => {},
});

export function getStoredToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function clearStoredToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

// Emitted from api.js when a mutating request comes back 401/403 — the token
// expired or the account isn't the owner. Consumers reset auth state.
export const AUTH_INVALID_EVENT = 'olive:auth-invalid';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [isOwner, setIsOwner] = useState(false);

  // Verify any token we already have. Silent failure leaves the UI read-only.
  useEffect(() => {
    if (!token) { setIsOwner(false); return; }
    let cancelled = false;
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setIsOwner(true);
        else { clearStoredToken(); setToken(null); setIsOwner(false); }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    function onInvalid() {
      clearStoredToken();
      setToken(null);
      setIsOwner(false);
    }
    window.addEventListener(AUTH_INVALID_EVENT, onInvalid);
    return () => window.removeEventListener(AUTH_INVALID_EVENT, onInvalid);
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    // Verify before persisting so an unauthorized account never gets stored.
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + credential },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Login failed');
    }
    try { localStorage.setItem(TOKEN_KEY, credential); } catch {}
    setToken(credential);
    setIsOwner(true);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setIsOwner(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isOwner, token, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
