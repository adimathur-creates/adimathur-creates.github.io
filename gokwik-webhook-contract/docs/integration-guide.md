# Checkout events: integration guide (draft, illustrative)

> Simulation material. The host, endpoints, header names and payloads below are made up for this
> exercise. They are not GoKwik's real API.

## 1. Before you start
- You need an HTTPS endpoint that accepts `POST` with a JSON body.
- Reply with any `2xx` within 10 seconds. Do the slow work (sending a WhatsApp, booking a shipment) after you reply, from a queue.
- You will get a signing secret when you create the subscription. Keep it out of your code repository.

## 2. Subscribe
From the merchant dashboard (Settings > Integrations > Event subscriptions), or with the API:

```http
POST https://api.example-checkout.test/v1/webhook_subscriptions
Authorization: Bearer <partner_api_key>
Content-Type: application/json

{
  "merchant_id": "m_001",
  "url": "https://partner.example/hooks/checkout",
  "events": ["checkout.abandoned", "order.placed"],
  "version": "2026-11-01"
}
```

The response includes `subscription_id` and `signing_secret`. A test event is sent straight away; its result shows in the delivery log.

## 3. What every event looks like

```json
{
  "id": "evt_c88231XQab00",
  "type": "checkout.abandoned",
  "version": "2026-11-01",
  "created_at": "2026-11-18T14:15:10Z",
  "merchant_id": "m_001",
  "environment": "modal",
  "data": {
    "checkout_id": "c_88231XQ",
    "amount_paise": 129900,
    "currency": "INR",
    "customer": { "phone_e164": "+919876543210" },
    "attribution": { "utm_source": "instagram", "utm_medium": "paid", "utm_campaign": "diwali" }
  }
}
```

Rules that never change within a version:
- `amount_paise` is always a whole number of paise. Rs 1,299.00 is `129900`.
- `created_at` is always UTC and ends in `Z`.
- `phone_e164` always has the country code, e.g. `+919876543210`.
- The same event has the same `id` on every retry and every replay.
- `environment` tells you which checkout setup produced the event. You should not need it to parse the event.

Events in this version: `checkout.abandoned`, `order.placed`, `payment.captured`, `order.cod_confirmed`, `order.cancelled`.

## 4. Check the signature
Every request has a header like:

```
X-Checkout-Signature: t=1763475310,v1=5f1c...e9
```

`v1` is HMAC-SHA256 of `"<t>.<raw request body>"` using your signing secret, in hex.

```js
// Node.js (Express). Use the RAW body, not the parsed JSON.
const crypto = require('crypto');

function isValid(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false; // too old: possible replay
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1 || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

When a secret is rotated, both the old and the new secret are valid for 24 hours. Check against both.

## 5. Handle duplicates and order
- Store the `id` of every event you process. If you see the same `id` again, reply `200` and do nothing.
- Events can arrive out of order (a retry of an older event can land after a newer one). Use `created_at`, or fetch the latest state, before acting.

## 6. Retries
If you do not reply `2xx` within 10 seconds, we try again after 1 min, 5 min, 30 min, 2 h, 6 h, 12 h and 24 h.
After the last attempt the event goes to the dead-letter queue. The merchant and you can see it in the
delivery log and replay it; a replay keeps the original `id`.

## 7. Versions and changes
- Adding a new optional field is not a breaking change and can happen any time. Ignore fields you do not know.
- Removing, renaming or changing the type of a field only happens in a new version, announced in the changelog at least 90 days before the old version stops.
