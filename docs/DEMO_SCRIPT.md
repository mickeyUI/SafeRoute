# Demo script (backend only)

This walkthrough uses the `stub` routing provider, so no external API keys are needed.

## 1. Start the stack

```bash
cp .env.example .env          # defaults are already demo-friendly
make db-up
make db-init
make migrate
make dev
```

Open <http://localhost:8000/docs> for interactive Swagger UI.

## 2. Health checks

```bash
curl -s localhost:8000/health
curl -s localhost:8000/api/v1/health/ready
```

Expected: `{"status":"ok","version":"0.1.0","routing_provider":"stub"}` and a
`database: ok` payload with a PostGIS version string.

## 3. Register, log in, and capture a token

```bash
curl -s -X POST localhost:8000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"demo@safaroute.local","password":"demo-pass-123","full_name":"Demo User"}'

TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@safaroute.local","password":"demo-pass-123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s localhost:8000/api/v1/auth/me -H "authorization: Bearer $TOKEN"
```

## 4. Compare routes

```bash
curl -s -X POST localhost:8000/api/v1/routes/compare \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d '{
    "origin": [-122.4194, 37.7749],
    "destination": [-122.4089, 37.7866],
    "travel_mode": "walk",
    "alternatives": 3
  }' | python3 -m json.tool
```

Point out that each alternative carries its own `safety_score`, `safety_confidence`,
and the three factors from `docs/ARCHITECTURE.md`.

## 5. Add a report and a safe location

```bash
curl -s -X POST localhost:8000/api/v1/reports \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d '{"type":"harassment","severity":4,"description":"Demo report near Market St","location":[-122.414,37.7807],"occurred_at":"2026-11-21T18:00:00Z"}'

curl -s -X POST localhost:8000/api/v1/safe-locations \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d '{"name":"24h Pharmacy","category":"shop","location":[-122.416,37.782],"address":"100 Demo St"}'
```

Explain that the report is `pending` until a moderator approves it; safe locations are
`is_verified=false` until verified. Run the comparison again to show unchanged scores
until moderation/verification.

## 6. Journey flow

```bash
JOURNEY=$(curl -s -X POST localhost:8000/api/v1/journeys \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d '{"origin":[-122.4194,37.7749],"destination":[-122.4089,37.7866],"travel_mode":"walk"}')
JOURNEY_ID=$(echo "$JOURNEY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

curl -s -X PATCH "localhost:8000/api/v1/journeys/$JOURNEY_ID/start" -H "authorization: Bearer $TOKEN"
curl -s -X PATCH "localhost:8000/api/v1/journeys/$JOURNEY_ID/check-in" -H "authorization: Bearer $TOKEN"
curl -s -X PATCH "localhost:8000/api/v1/journeys/$JOURNEY_ID/complete" -H "authorization: Bearer $TOKEN"
```

## Talking points

- Provider swap is one environment variable: `ROUTING_PROVIDER=graphhopper`.
- Scores are explainable, not a black box.
- Geometry and radius queries are indexed by PostGIS.
- Reminder worker and mobile client are explicitly post-MVP phases.
