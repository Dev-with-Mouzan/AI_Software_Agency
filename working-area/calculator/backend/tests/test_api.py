"""Integration tests for the FastAPI calculator API."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_operations() -> None:
    resp = client.get("/api/operations")
    assert resp.status_code == 200
    body = resp.json()
    assert "+" in body["operators"]
    assert "sqrt" in body["functions"]


def test_calculate_success() -> None:
    resp = client.post("/api/calculate", json={"expression": "2 + 3 * 4"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["result"] == 14
    assert body["expression"] == "2 + 3 * 4"
    assert "computed_at" in body


def test_calculate_division_by_zero() -> None:
    resp = client.post("/api/calculate", json={"expression": "1 / 0"})
    assert resp.status_code == 400
    assert "division by zero" in resp.json()["detail"]


def test_calculate_unsafe_code_rejected() -> None:
    resp = client.post("/api/calculate", json={"expression": "__import__('os')"})
    assert resp.status_code == 400


def test_calculate_missing_expression() -> None:
    resp = client.post("/api/calculate", json={})
    assert resp.status_code == 422


def test_calculate_query_param_fallback() -> None:
    resp = client.post("/api/calculate?expression=2%2B2")
    assert resp.status_code == 200
    assert resp.json()["result"] == 4


def test_calculate_blank_expression_rejected() -> None:
    resp = client.post("/api/calculate", json={"expression": "   "})
    assert resp.status_code == 422


def test_history_flow() -> None:
    # Clear any state from previous tests in this module run.
    client.delete("/api/history")

    client.post("/api/calculate", json={"expression": "1 + 1"})
    client.post("/api/calculate", json={"expression": "sqrt(9)"})

    resp = client.get("/api/history?limit=10")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert body["entries"][0]["expression"] == "sqrt(9)"  # newest first
    assert body["entries"][0]["result"] == 3


def test_clear_history() -> None:
    client.post("/api/calculate", json={"expression": "5 * 5"})
    resp = client.delete("/api/history")
    assert resp.status_code == 204
    assert client.get("/api/history").json()["total"] == 0
