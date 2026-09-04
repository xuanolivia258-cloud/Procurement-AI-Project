import httpx
import pytest
from pydantic import SecretStr

from app.config import settings
from app.logging_config import summarize_http_response
from app.main import clear_exchange_rate_caches, parse_exchange_rate_response, parse_iam_token_response


@pytest.fixture(autouse=True)
def reset_exchange_rate_caches():
    clear_exchange_rate_caches()
    yield
    clear_exchange_rate_caches()


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


def test_integration_response_summary_redacts_secrets_and_tokens():
    request = httpx.Request("POST", settings.exchange_rate_iam_token_url)
    response = httpx.Response(401, request=request, json={
        "message": "authentication failed",
        "data": {"attributes": {
            "account": "internal-account", "secret": "do-not-log", "token": "dynamic-token",
        }},
    })

    summary = summarize_http_response(response)

    assert "authentication failed" in summary
    assert "do-not-log" not in summary
    assert "dynamic-token" not in summary
    assert "internal-account" not in summary
    assert summary.count("[REDACTED]") == 3

    text_response = httpx.Response(401, request=request, text="Authorization: Bearer plaintext-token; denied")
    text_summary = summarize_http_response(text_response)
    assert "plaintext-token" not in text_summary
    assert "Authorization: [REDACTED]" in text_summary


def test_exchange_rate_response_parser():
    payload = {"status": 200, "message": "success", "data": {"result": [
        {
            "from_currency": "CAD", "to_currency": "USD", "rate_type": "SPOT-SATE",
            "rate_date": "2026-08-23", "rate_value": "0.7100",
        },
        {
            "from_currency": "CAD", "to_currency": "USD", "rate_type": "SPOT-SATE",
            "rate_date": "2026-08-24", "rate_value": "0.7185",
        },
    ]}}
    rate, quoted_at = parse_exchange_rate_response(payload, "CAD", "USD", "SPOT-SATE")
    assert str(rate) == "0.7185"
    assert quoted_at.isoformat() == "2026-08-24T00:00:00+00:00"


def test_exchange_rate_calls_idata_finance(client, monkeypatch):
    configure_iam(monkeypatch)
    integration_events = []
    monkeypatch.setattr("app.main.log_integration_event", lambda **kwargs: integration_events.append(kwargs))
    token_request = httpx.Request("POST", settings.exchange_rate_iam_token_url)
    token_response = httpx.Response(200, request=token_request, json={
        "data": {"type": "token", "attributes": {"token": "dynamic-token"}},
    })
    rate_request = httpx.Request("POST", settings.exchange_rate_api_url)
    rate_response = httpx.Response(200, request=rate_request, json={
        "status": 200, "message": "success", "data": {"result": [{
            "from_currency": "CNY", "to_currency": "USD", "rate_type": "SPOT-SATE",
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
    assert calls[1][1]["json"]["data"][0]["rate_type"] == "SPOT-SATE"
    assert len(calls[1][1]["json"]["data"]) == settings.exchange_rate_lookback_days + 1
    assert len({item["start_date"] for item in calls[1][1]["json"]["data"]}) == settings.exchange_rate_lookback_days + 1
    assert [(event["service"], event["operation"], event["result"], event["status"])
            for event in integration_events] == [
        ("huawei_iam", "token_fetch", "success", 200),
        ("huawei_idata_finance", "exchange_rate_fetch", "success", 200),
    ]
    assert "dynamic-token" not in repr(integration_events)
    assert "test-secret" not in repr(integration_events)


def test_exchange_rate_reuses_token_and_rate_caches(client, monkeypatch):
    configure_iam(monkeypatch)
    calls = []

    def post(url, **kwargs):
        calls.append(url)
        request = httpx.Request("POST", url)
        if url == settings.exchange_rate_iam_token_url:
            return httpx.Response(200, request=request, json={
                "data": {"attributes": {"token": "dynamic-token"}},
            })
        currency = kwargs["json"]["data"][0]["from_currency"]
        return httpx.Response(200, request=request, json={
            "status": 200, "message": "success", "data": {"result": [{
                "from_currency": currency, "to_currency": "USD", "rate_type": "SPOT-SATE",
                "rate_date": "2026-08-24", "rate_value": "0.7185",
            }]},
        })

    monkeypatch.setattr(httpx, "post", post)

    first = client.get("/api/exchange-rate?currency=CAD")
    second = client.get("/api/exchange-rate?currency=CAD")
    third = client.get("/api/exchange-rate?currency=CNY")

    assert first.status_code == second.status_code == third.status_code == 200
    assert second.json()["cached"] is True
    assert calls == [settings.exchange_rate_iam_token_url, settings.exchange_rate_api_url,
                     settings.exchange_rate_api_url]


def test_exchange_rate_reports_no_published_quote_without_generic_502(client, monkeypatch):
    configure_iam(monkeypatch)
    token_request = httpx.Request("POST", settings.exchange_rate_iam_token_url)
    rate_request = httpx.Request("POST", settings.exchange_rate_api_url)
    responses = [
        httpx.Response(200, request=token_request, json={"data": {"attributes": {"token": "dynamic-token"}}}),
        httpx.Response(200, request=rate_request, json={
            "status": 200, "message": "success", "data": {"result": []},
        }),
    ]
    monkeypatch.setattr(httpx, "post", lambda *_args, **_kwargs: responses.pop(0))

    response = client.get("/api/exchange-rate?currency=CAD")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "EXCHANGE_RATE_NOT_AVAILABLE"


def test_exchange_rate_uses_last_rate_when_refresh_has_no_quote(client, monkeypatch):
    configure_iam(monkeypatch)
    monkeypatch.setattr(settings, "exchange_rate_cache_seconds", 0)
    monkeypatch.setattr(settings, "exchange_rate_stale_seconds", 3600)
    rate_calls = 0

    def post(url, **_kwargs):
        nonlocal rate_calls
        request = httpx.Request("POST", url)
        if url == settings.exchange_rate_iam_token_url:
            return httpx.Response(200, request=request, json={
                "data": {"attributes": {"token": "dynamic-token"}},
            })
        rate_calls += 1
        result = [{
            "from_currency": "CAD", "to_currency": "USD", "rate_type": "SPOT-SATE",
            "rate_date": "2026-08-24", "rate_value": "0.7185",
        }] if rate_calls == 1 else []
        return httpx.Response(200, request=request, json={
            "status": 200, "message": "success", "data": {"result": result},
        })

    monkeypatch.setattr(httpx, "post", post)

    initial = client.get("/api/exchange-rate?currency=CAD")
    fallback = client.get("/api/exchange-rate?currency=CAD")

    assert initial.status_code == fallback.status_code == 200
    assert fallback.json()["rate"] == "0.7185"
    assert fallback.json()["cached"] is True
    assert fallback.json()["stale"] is True
    assert rate_calls == 2


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
    assert response.json()["error"]["code"] == "EXCHANGE_RATE_AUTH_UNAVAILABLE"
    assert len(calls) == 1


def test_usd_exchange_rate_does_not_call_upstream(client, monkeypatch):
    def unexpected_post(*_args, **_kwargs):
        raise AssertionError("unexpected upstream call")

    monkeypatch.setattr(httpx, "post", unexpected_post)
    response = client.get("/api/exchange-rate?currency=USD")
    assert response.status_code == 200
    assert response.json()["rate"] == "1.00000000"
