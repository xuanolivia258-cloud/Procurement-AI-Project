import httpx

from app.config import settings
from app.main import parse_exchange_rate_response


def test_exchange_rate_response_parser():
    payload = {"status": 200, "message": "success", "data": {"result": [{
        "from_currency": "CAD", "to_currency": "USD", "rate_type": "SPOT",
        "rate_date": "2026-08-24", "rate_value": "0.7185",
    }]}}
    rate, quoted_at = parse_exchange_rate_response(payload, "CAD", "USD", "SPOT")
    assert str(rate) == "0.7185"
    assert quoted_at.isoformat() == "2026-08-24T00:00:00+00:00"


def test_exchange_rate_calls_idata_finance(client, monkeypatch):
    monkeypatch.setattr(settings, "exchange_rate_tenant_id", "1" * 32)
    request = httpx.Request("POST", settings.exchange_rate_api_url)
    upstream = httpx.Response(200, request=request, json={
        "status": 200, "message": "success", "data": {"result": [{
            "from_currency": "CNY", "to_currency": "USD", "rate_type": "SPOT",
            "rate_date": "2026-08-24", "rate_value": "0.139245",
        }]},
    })
    received = {}

    def post(url, **kwargs):
        received["url"] = url
        received.update(kwargs)
        return upstream

    monkeypatch.setattr(httpx, "post", post)
    response = client.get("/api/exchange-rate?currency=CNY")

    assert response.status_code == 200
    assert response.json()["rate"] == "0.139245"
    assert response.json()["source"] == "Huawei iData Finance"
    assert received["url"] == settings.exchange_rate_api_url
    assert received["json"]["tenant_id"] == "1" * 32
    assert received["json"]["multi_rate_type_flag"] == "Y"
    assert received["json"]["data"][0]["from_currency"] == "CNY"
    assert received["json"]["data"][0]["to_currency"] == "USD"
    assert received["json"]["data"][0]["rate_type"] == "SPOT"


def test_exchange_rate_requires_tenant_configuration(client, monkeypatch):
    monkeypatch.setattr(settings, "exchange_rate_tenant_id", "")
    response = client.get("/api/exchange-rate?currency=CAD")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "EXCHANGE_RATE_NOT_CONFIGURED"


def test_usd_exchange_rate_does_not_call_upstream(client, monkeypatch):
    def unexpected_post(*_args, **_kwargs):
        raise AssertionError("unexpected upstream call")

    monkeypatch.setattr(httpx, "post", unexpected_post)
    response = client.get("/api/exchange-rate?currency=USD")
    assert response.status_code == 200
    assert response.json()["rate"] == "1.00000000"
