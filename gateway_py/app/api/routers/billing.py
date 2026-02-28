import uuid
from fastapi import APIRouter, Request, Response
from app.api.common import err
from app.api.dependencies.auth import require_user
from app.api.dependencies.csrf import require_csrf
from app.schemas import CallbackStatusRequest, CheckoutRequest, PromoRequest
from app.services import billing_service

router = APIRouter(tags=['profile'])

@router.get('/api/v1/entitlements')
def ents(req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    usage = billing_service.usage(uid)
    return {'limits': [{'limit': 'rooms', 'used': usage['usage']['rooms'], 'max': 10}, {'limit': 'bots', 'used': usage['usage']['bots'], 'max': 20}, {'limit': 'ai', 'used': usage['usage']['ai'], 'max': 30}], 'byLimit': {'rooms': {'limit': 'rooms', 'used': usage['usage']['rooms'], 'max': 10}, 'bots': {'limit': 'bots', 'used': usage['usage']['bots'], 'max': 20}, 'ai': {'limit': 'ai', 'used': usage['usage']['ai'], 'max': 30}}}

@router.get('/api/v1/usage')
def usage(req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    return billing_service.usage(uid)

@router.get('/api/v1/billing/plans')
def billing_plans(req: Request):
    if not require_user(req): return err(401,'unauthorized','session cookie is missing or invalid')
    return {'plans': billing_service.BILLING_PLANS}

@router.get('/api/v1/billing/current')
def billing_current(req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    return {'subscription': billing_service.load_subscription(uid)}

@router.get('/api/v1/billing/history')
def billing_history(req: Request):
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    return {'transactions': billing_service.history(uid)}

@router.post('/api/v1/billing/checkout')
def billing_checkout(req: Request, body: CheckoutRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    out = billing_service.checkout(uid, body.planCode)
    if not out: return err(400, 'validation_error', 'unknown billing plan')
    return out

@router.post('/api/v1/billing/cancel')
def billing_cancel(req: Request):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    sub = billing_service.load_subscription(uid); sub['status'] = 'canceled'; sub['cancelAtPeriodEnd'] = True
    billing_service.save_subscription(uid, sub)
    billing_service.append_tx(uid, {'id': f"tx_{uuid.uuid4().hex[:10]}", 'status': 'canceled', 'amount': 0, 'currency': 'USD', 'occurredAt': billing_service.utc_now_iso(), 'description': 'Subscription canceled'})
    return Response(status_code=204)

@router.post('/api/v1/billing/promo')
def billing_promo(req: Request, body: PromoRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    code = body.code.strip()
    if len(code) < 3: return err(400, 'validation_error', 'promo code is too short')
    billing_service.apply_promo(uid, code)
    return {'status': 'applied', 'code': code}

@router.post('/api/v1/billing/callback-status')
def billing_callback_status(req: Request, body: CallbackStatusRequest):
    if (e := require_csrf(req)): return e
    uid = require_user(req)
    if not uid: return err(401,'unauthorized','session cookie is missing or invalid')
    billing_service.append_tx(uid, {'id': body.sessionId or f"tx_{uuid.uuid4().hex[:10]}", 'status': body.paymentStatus or 'pending', 'amount': 0, 'currency': 'USD', 'occurredAt': billing_service.utc_now_iso(), 'description': 'Payment callback status'})
    return {'status': 'accepted'}
