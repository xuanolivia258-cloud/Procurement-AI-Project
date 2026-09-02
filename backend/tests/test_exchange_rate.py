import httpx
from pydantic import SecretStr

from app.config import settings
from app.main import parse_exchange_rate_response, parse_iam_token_response


def configure_iam(monkeypatch):
    monkeypatch.setattr(settings, "exchange_rate_tenant_id", "")
    monkeypatch.setattr(settings, "exchange_rate_iam_account", "test-account")
    monkeypatch.setattr(settings, "exchange_rate_iam_secret", SecretStr("test-secret"))
    monkeypatch.setattr(settings, "exchange_rate_iam_project_id", "test-project")
    monkeypatch.setattr(settings, "exchange_rate_iam_enterprise_id", "1" * 32)


def test_iam_token_response_parser_supports_body_and_header_tokens():
    request = httpx.Request("POST", settings.exchange_rate_iam_token_url)
    body_response = httpx.Response(200, request=request, json={
        "data": {"type": "token", "attributes": {"token": "body-token"}},
    })
    header_response = httpx.Response(200, request=request, headers={"Authorization": "header-token"})

    assert parse_iam_token_response(body_response) == "body-token"
    assert parse_iam_token_response(header_response) == "header-token"


def test_exchange_rate_response_parser():
    payload = {"status": 200, "message": "success", "data": {"result": [{
        "from_currency": "CAD", "to_currency": "USD", "rate_type": "SPOT",
        "rate_date": "2026-08-24", "rate_value": "0.7185",
    }]}}
    rate, quoted_at = parse_exchange_rate_response(payload, "CAD", "USD", "SPOT")
    assert str(rate) == "0.7185"
    assert quoted_at.isoformat() == "2026-08-24T00:00:00+00:00"


def test_exchange_rate_calls_idata_finance(client, monkeypatch):
    configure_iam(monkeypatch)
    token_request = httpx.Request("POST", settings.exchange_rate_iam_token_url)
    token_response = httpx.Response(200, request=token_request, json={
        "data": {"type": "token", "attributes": {"token": "dynamic-token"}},
    })
    rate_request = httpx.Request("POST", settings.exchange_rate_api_url)
    rate_response = httpx.Response(200, request=rate_request, json={
        "status": 200, "message": "success", "data": {"result": [{
            "from_currency": "CNY", "to_currency": "USD", "rate_type": "SPOT",
            "rate_date": "2026-08-24", "rate_value": "0.139245",
        }]},
    })
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return token_response if url == settings.exchange_rate_iam_token_url else rate_response

    monkeypatch.setattr(httpx, "post", post)
    response = client.get("/api/exchange-rate?currency=CNY")

    assert response.status_code == 200
    assert response.json()["rate"] == "0.139245"
    assert response.json()["source"] == "Huawei iData Finance"
    assert [url for url, _kwargs in calls] == [settings.exchange_rate_iam_token_url, settings.exchange_rate_api_url]
    assert calls[0][1]["json"] == {"data": {"type": "token", "attributes": {
        "account": "test-account", "secret": "test-secret", "project": "test-project", "enterprise": "1" * 32,
    }}}
    assert calls[1][1]["headers"] == {"Authorization": "dynamic-token"}
    assert calls[1][1]["json"]["tenant_id"] == "1" * 32
    assert calls[1][1]["json"]["multi_rate_type_flag"] == "Y"
    assert calls[1][1]["json"]["data"][0]["from_currency"] == "CNY"
    assert calls[1][1]["json"]["data"][0]["to_currency"] == "USD"
    assert calls[1][1]["json"]["data"][0]["rate_type"] == "SPOT"


def test_exchange_rate_requires_tenant_configuration(client, monkeypatch):
    monkeypatch.setattr(settings, "exchange_rate_tenant_id", "")
    monkeypatch.setattr(settings, "exchange_rate_iam_account", "")
    monkeypatch.setattr(settings, "exchange_rate_iam_secret", SecretStr(""))
    monkeypatch.setattr(settings, "exchange_rate_iam_project_id", "")
    monkeypatch.setattr(settings, "exchange_rate_iam_enterprise_id", "")
    response = client.get("/api/exchange-rate?currency=CAD")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "EXCHANGE_RATE_NOT_CONFIGURED"


def test_exchange_rate_stops_when_iam_returns_no_token(client, monkeypatch):
    configure_iam(monkeypatch)
    token_request = httpx.Request("POST", settings.exchange_rate_iam_token_url)
    token_response = httpx.Response(200, request=token_request, json={"data": {"type": "token", "attributes": {}}})
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return token_response

    monkeypatch.setattr(httpx, "post", post)
    response = client.get("/api/exchange-rate?currency=EUR")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "EXCHANGE_RATE_UNAVAILABLE"
    assert len(calls) == 1


def test_usd_exchange_rate_does_not_call_upstream(client, monkeypatch):
    def unexpected_post(*_args, **_kwargs):
        raise AssertionError("unexpected upstream call")

    monkeypatch.setattr(httpx, "post", unexpected_post)
    response = client.get("/api/exchange-rate?currency=USD")
    assert response.status_code == 200
    assert response.json()["rate"] == "1.00000000"
