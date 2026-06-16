"""Auth: GETs are always public; writes require a valid session cookie.

Login is Google sign-in (OIDC). Tests mock google-auth's token verification so
they never hit Google — only our own authorization logic (owner email +
email_verified) and session issuing are exercised.
"""

import pytest

from app import auth


@pytest.fixture()
def fake_google(monkeypatch):
    """Patch google-auth so /api/auth/google returns whatever claims we set.

    Returns a setter; call it with the claims the verified ID token should
    contain, or with None to simulate an invalid/forged token.
    """

    def set_claims(claims):
        def fake_verify(credential, request, audience):
            if claims is None:
                raise ValueError("invalid token")
            return claims

        monkeypatch.setattr(auth.id_token, "verify_oauth2_token", fake_verify)

    return set_claims


def test_get_trees_is_public(client):
    assert client.get("/api/trees").status_code == 200


def test_get_dashboard_is_public(client):
    assert client.get("/api/dashboard").status_code == 200


def test_post_tree_without_cookie_is_401(client):
    res = client.post("/api/trees", json={"label": "T99", "row": 1, "col": 1, "variety": "", "notes": ""})
    assert res.status_code == 401


def test_post_tree_with_valid_cookie_succeeds(authed_client):
    res = authed_client.post("/api/trees", json={"label": "T99", "row": 1, "col": 1, "variety": "", "notes": ""})
    assert res.status_code == 201
    authed_client.delete(f"/api/trees/{res.json()['id']}")


def test_delete_tree_without_cookie_is_401(authed_client):
    tree = authed_client.post(
        "/api/trees", json={"label": "TDel", "row": 9, "col": 9, "variety": "", "notes": ""}
    ).json()
    # Log out so we have no cookie
    authed_client.post("/api/auth/logout")
    assert authed_client.delete(f"/api/trees/{tree['id']}").status_code == 401
    # Re-set the session cookie to clean up
    authed_client.cookies.set("olive_session", auth._issue_session())
    authed_client.delete(f"/api/trees/{tree['id']}")


def test_verify_with_valid_cookie(authed_client):
    assert authed_client.get("/api/auth/verify").status_code == 200


def test_verify_without_cookie_is_401(client):
    assert client.get("/api/auth/verify").status_code == 401


def test_google_login_with_owner_email_sets_cookie(client, fake_google):
    fake_google({"email": "owner@example.com", "email_verified": True})
    res = client.post("/api/auth/google", json={"credential": "good-token"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert "olive_session" in client.cookies


def test_google_login_email_match_is_case_insensitive(client, fake_google):
    fake_google({"email": "Owner@Example.com", "email_verified": True})
    assert client.post("/api/auth/google", json={"credential": "good-token"}).status_code == 200


def test_google_login_wrong_email_is_403(client, fake_google):
    fake_google({"email": "stranger@example.com", "email_verified": True})
    res = client.post("/api/auth/google", json={"credential": "good-token"})
    assert res.status_code == 403
    assert "olive_session" not in client.cookies


def test_google_login_unverified_email_is_403(client, fake_google):
    fake_google({"email": "owner@example.com", "email_verified": False})
    assert client.post("/api/auth/google", json={"credential": "good-token"}).status_code == 403


def test_google_login_invalid_token_is_401(client, fake_google):
    fake_google(None)
    assert client.post("/api/auth/google", json={"credential": "forged"}).status_code == 401


def test_logout_clears_session(authed_client):
    assert authed_client.get("/api/auth/verify").status_code == 200
    authed_client.post("/api/auth/logout")
    assert authed_client.get("/api/auth/verify").status_code == 401


def test_rate_limit_after_five_failures(client, fake_google):
    fake_google(None)  # every attempt fails verification
    for _ in range(5):
        client.post("/api/auth/google", json={"credential": "forged"})
    res = client.post("/api/auth/google", json={"credential": "forged"})
    assert res.status_code == 429
