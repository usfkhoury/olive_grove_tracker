"""Regression guard: the prod CSP must permit Google Identity Services.

The Caddy Content-Security-Policy fronts olives.usfkhoury.com. A `script-src
'self'` policy silently blocks the GIS client script, so the owner-login modal
fails with "Could not load Google sign-in" in prod (it works locally where no
Caddy/CSP is in front). These assertions pin the GIS origins so tightening the
policy can't re-break login unnoticed.
"""

from pathlib import Path

import pytest

CADDYFILE = Path(__file__).resolve().parents[2] / "Caddyfile"


def _csp() -> str:
    for line in CADDYFILE.read_text().splitlines():
        if "Content-Security-Policy" in line:
            return line
    raise AssertionError("No Content-Security-Policy found in Caddyfile")


@pytest.mark.parametrize(
    "directive",
    [
        # GIS client script, sign-in iframe, network calls, and injected styles.
        "script-src 'self' https://accounts.google.com/gsi/client",
        "frame-src https://accounts.google.com/gsi/",
        "connect-src 'self' https://accounts.google.com/gsi/",
        "https://accounts.google.com/gsi/style",
    ],
)
def test_csp_allows_google_identity_services(directive):
    assert directive in _csp()
