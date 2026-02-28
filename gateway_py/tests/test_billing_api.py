def test_billing_requires_auth(client):
    response = client.get('/api/v1/billing/plans')
    assert response.status_code == 401


def test_billing_happy_path(client, host_session_cookie, csrf_headers):
    plans = client.get('/api/v1/billing/plans', cookies=host_session_cookie)
    assert plans.status_code == 200
    assert plans.json()['plans'][0]['code'] == 'free'

    current = client.get('/api/v1/billing/current', cookies=host_session_cookie)
    assert current.status_code == 200
    assert current.json()['subscription']['planCode'] == 'free'

    cookies = {**host_session_cookie, **csrf_headers['cookies']}
    promo = client.post('/api/v1/billing/promo', cookies=cookies, headers=csrf_headers['headers'], json={'code': 'PROMO'})
    assert promo.status_code == 200

    checkout = client.post('/api/v1/billing/checkout', cookies=cookies, headers=csrf_headers['headers'], json={'planCode': 'free'})
    assert checkout.status_code == 200

    cancel = client.post('/api/v1/billing/cancel', cookies=cookies, headers=csrf_headers['headers'])
    assert cancel.status_code == 204

    history = client.get('/api/v1/billing/history', cookies=host_session_cookie)
    assert history.status_code == 200
    assert len(history.json()['transactions']) >= 1
