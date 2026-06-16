import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Load the Google Identity Services script once and resolve when window.google is ready.
// Cached as a module-level promise so reopening the modal doesn't re-inject the tag.
let gisPromise;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      gisPromise = undefined; // allow a retry on next open
      reject(new Error('Could not load Google sign-in'));
    });
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return gisPromise;
}

export default function LoginModal({ onClose }) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) {
      setError('Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).');
      return;
    }

    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              await loginWithGoogle(credential);
              onClose();
            } catch (err) {
              setError(err.message);
            }
          },
        });
        const dark = document.documentElement.dataset.theme === 'dark';
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box card" onClick={(e) => e.stopPropagation()}>
        <h2>Owner login</h2>
        <div ref={buttonRef} />
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
