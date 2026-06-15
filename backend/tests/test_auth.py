"""Auth: GETs are always public; writes require a valid session cookie."""


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
    # Re-login to clean up
    authed_client.post("/api/auth/login", json={"token": "test-secret"})
    authed_client.delete(f"/api/trees/{tree['id']}")


def test_verify_with_valid_cookie(authed_client):
    assert authed_client.get("/api/auth/verify").status_code == 200


def test_verify_without_cookie_is_401(client):
    assert client.get("/api/auth/verify").status_code == 401


def test_login_with_wrong_token_is_401(client):
    assert client.post("/api/auth/login", json={"token": "wrong"}).status_code == 401


def test_login_with_correct_token_sets_cookie(client):
    res = client.post("/api/auth/login", json={"token": "test-secret"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    assert "olive_session" in client.cookies


def test_logout_clears_session(authed_client):
    assert authed_client.get("/api/auth/verify").status_code == 200
    authed_client.post("/api/auth/logout")
    assert authed_client.get("/api/auth/verify").status_code == 401


def test_rate_limit_after_five_failures(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"token": "wrong"})
    res = client.post("/api/auth/login", json={"token": "wrong"})
    assert res.status_code == 429
