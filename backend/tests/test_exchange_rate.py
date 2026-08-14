from app.main import parse_yahoo_finance_rate


def test_yahoo_finance_rate_parser():
    payload = {"chart": {"result": [{"meta": {"regularMarketPrice": 0.7185, "regularMarketTime": 1786464000}}]}}
    rate, quoted_at = parse_yahoo_finance_rate(payload)
    assert str(rate) == "0.7185"
    assert quoted_at is not None


def test_usd_exchange_rate_does_not_call_yahoo(client):
    response = client.get("/api/exchange-rate?currency=USD")
    assert response.status_code == 200
    assert response.json()["rate"] == "1.00000000"
