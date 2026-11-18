-- Adoption and reliability of the event contract (PostgreSQL). Tables are illustrative.

-- webhook_subscriptions(subscription_id, merchant_id, partner_id, url, version, created_via, created_at, disabled_at)
--   version:     'legacy' or '2026-11-01'
--   created_via: 'dashboard', 'partner_api' or 'integration_team'
-- webhook_events(event_id, merchant_id, type, environment, created_at)
-- webhook_attempts(attempt_id, event_id, subscription_id, attempt_no, sent_at, response_code, latency_ms, outcome)
--   outcome: 'acked', 'http_error', 'timeout', 'dlq', 'replayed'

-- 1. North star: share of subscribed events acked within 5 minutes, by partner and checkout setup (last 7 days)
WITH first_ack AS (
  SELECT a.subscription_id, a.event_id, MIN(a.sent_at) AS acked_at
  FROM webhook_attempts a
  WHERE a.outcome = 'acked'
  GROUP BY 1, 2
), due AS (
  SELECT s.subscription_id, s.partner_id, e.event_id, e.environment, e.created_at
  FROM webhook_events e
  JOIN webhook_attempts a0 ON a0.event_id = e.event_id AND a0.attempt_no = 1
  JOIN webhook_subscriptions s ON s.subscription_id = a0.subscription_id
  WHERE e.created_at >= now() - interval '7 days'
)
SELECT d.partner_id, d.environment,
       COUNT(*) AS events,
       ROUND(100.0 * COUNT(*) FILTER (WHERE f.acked_at <= d.created_at + interval '5 minutes') / COUNT(*), 2) AS pct_on_time,
       ROUND(100.0 * COUNT(*) FILTER (WHERE f.acked_at IS NULL) / COUNT(*), 2) AS pct_not_delivered
FROM due d
LEFT JOIN first_ack f ON f.subscription_id = d.subscription_id AND f.event_id = d.event_id
GROUP BY 1, 2
ORDER BY pct_on_time;

-- 2. Adoption: share of active subscriptions on the contract, and share created without a ticket
SELECT date_trunc('week', created_at) AS week,
       ROUND(100.0 * AVG((version <> 'legacy')::int), 1) AS pct_on_contract,
       ROUND(100.0 * AVG((created_via <> 'integration_team')::int), 1) AS pct_self_serve
FROM webhook_subscriptions
WHERE disabled_at IS NULL
GROUP BY 1
ORDER BY 1;

-- 3. Time to first successful delivery for new subscriptions (target: under 15 minutes)
SELECT s.created_via,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM (f.first_ack - s.created_at)) / 60) AS median_min,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM (f.first_ack - s.created_at)) / 60) AS p90_min
FROM webhook_subscriptions s
JOIN LATERAL (
  SELECT MIN(a.sent_at) AS first_ack FROM webhook_attempts a
  WHERE a.subscription_id = s.subscription_id AND a.outcome = 'acked'
) f ON true
WHERE s.created_at >= now() - interval '30 days'
GROUP BY 1;

-- 4. Dead-letter queue: how many, how old, for whom (anything older than 24 h needs a human)
SELECT s.partner_id, s.merchant_id, COUNT(*) AS parked,
       MAX(now() - a.sent_at) AS oldest
FROM webhook_attempts a
JOIN webhook_subscriptions s USING (subscription_id)
WHERE a.outcome = 'dlq'
  AND NOT EXISTS (SELECT 1 FROM webhook_attempts r
                  WHERE r.event_id = a.event_id AND r.subscription_id = a.subscription_id AND r.outcome = 'replayed')
GROUP BY 1, 2
ORDER BY parked DESC;

-- 5. Endpoints to alert on: success rate under 95% in the last hour (at least 20 attempts)
SELECT a.subscription_id, s.partner_id, s.merchant_id,
       COUNT(*) AS attempts,
       ROUND(100.0 * AVG((a.outcome = 'acked')::int), 1) AS success_pct,
       MODE() WITHIN GROUP (ORDER BY a.response_code) AS common_code
FROM webhook_attempts a
JOIN webhook_subscriptions s USING (subscription_id)
WHERE a.sent_at >= now() - interval '1 hour'
GROUP BY 1, 2, 3
HAVING COUNT(*) >= 20 AND AVG((a.outcome = 'acked')::int) < 0.95;

-- 6. Guardrail: retries that handed the same event to the same endpoint more than once after an ack
SELECT partner_id, COUNT(*) AS events_acked_twice
FROM (
  SELECT s.partner_id, a.event_id, a.subscription_id
  FROM webhook_attempts a
  JOIN webhook_subscriptions s USING (subscription_id)
  WHERE a.outcome = 'acked'
  GROUP BY 1, 2, 3
  HAVING COUNT(*) > 1
) x
GROUP BY partner_id
ORDER BY events_acked_twice DESC;
