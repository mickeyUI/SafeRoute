# API contracts (v1)

Base URL: `/api/v1`. All request/response bodies are JSON. Coordinates are
`[longitude, latitude]` arrays (GeoJSON axis order). Errors share one shape:

```json
{
  "error": {
    "code": "not_found",
    "message": "Report not found",
    "details": null,
    "request_id": "3f1d..."
  }
}
```

Authentication uses `Authorization: Bearer <access_token>`. Obtain a token from
`POST /auth/login`. Moderator endpoints additionally require a user with role
`moderator` or `admin`.

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | no | Process liveness, provider name, version |
| GET | `/api/v1/health/ready` | no | DB `SELECT 1` and PostGIS version |

Example `GET /health`:

```json
{"status": "ok", "version": "0.1.0", "routing_provider": "stub"}
```

## Auth

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | no | `{email, password, full_name?}` | `UserRead` (201) |
| POST | `/auth/login` | no | `{email, password}` | `{access_token, token_type, expires_in}` |
| GET | `/auth/me` | yes | — | `UserRead` |

Password rules: at least 8 characters. Duplicate email returns `409 conflict_error`.

## Routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/routes/compare` | optional | Compare alternatives for a corridor |
| GET | `/routes/{route_id}` | optional | Fetch one persisted alternative |

`POST /routes/compare` request:

```json
{
  "origin": [-122.4194, 37.7749],
  "destination": [-122.4089, 37.7866],
  "travel_mode": "walk",
  "alternatives": 3,
  "depart_at": null,
  "use_reports": true
}
```

Response (abridged):

```json
{
  "request_id": "0f6b...",
  "alternatives": [
    {
      "id": "6c2a...",
      "rank": 1,
      "provider": "stub",
      "travel_mode": "walk",
      "distance_m": 1820,
      "duration_s": 1365,
      "safety_score": 82.4,
      "safety_confidence": 0.61,
      "safety_factors": {
        "report_penalty": 3.2,
        "coverage_bonus": 2.0,
        "length_penalty": 0.4,
        "nearby_report_count": 1
      },
      "geometry": [[-122.4194, 37.7749], [-122.414, 37.7807]]
    }
  ]
}
```

Unknown `travel_mode` or malformed coordinates return `422 validation_error`.

## Reports

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/reports` | no | Create a report; anonymous submissions are supported (201) |
| GET | `/reports/nearby` | no | Reports within `radius_m` (default 1000) |
| GET | `/reports/{report_id}` | no | One report |
| PATCH | `/reports/{report_id}/moderate` | moderator | Set `approved` or `rejected` |

Create body:

```json
{
  "category": "harassment",
  "severity": 4,
  "description": "Catcalling near the underpass, 3 people present.",
  "latitude": 9.0320,
  "longitude": 38.7500,
  "is_anonymous": true
}
```

Live map submissions are marked `approved` so nearby users see them immediately.
Reports are written to the in-memory store and, when the database is available,
persisted in PostGIS so they survive backend restarts. Anonymous reports have no
`reporter_id`.

## Safe locations

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/safe-locations` | yes | Suggest a safe location (201, `is_verified=false`) |
| GET | `/safe-locations/nearby` | no | Verified locations within radius |
| GET | `/safe-locations/{location_id}` | no | One location |

Categories: `police`, `hospital`, `transit`, `shop`, `friend`, `other`.

## Journeys

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/journeys` | yes | Create a planned journey (201) |
| GET | `/journeys/active` | yes | Current active/planned journey |
| GET | `/journeys/{journey_id}` | yes | Journey detail |
| PATCH | `/journeys/{journey_id}/start` | yes | `planned -> active` |
| PATCH | `/journeys/{journey_id}/check-in` | yes | Refresh `check_in_at` |
| PATCH | `/journeys/{journey_id}/complete` | yes | `active -> completed` |
| PATCH | `/journeys/{journey_id}/cancel` | yes | Any non-terminal -> `cancelled` |

Invalid transitions return `409 invalid_state`.

### Public shared journeys

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/shared/journeys/{share_token}` | no | Public tracking view for a shared journey token |

Returns the journey status, origin/destination, estimated arrival, latest check-in,
route coordinates, and `remaining_minutes`. Unknown/revoked tokens return `404`;
expired tokens return `410`. The web client renders this at `/track/{share_token}`.

## Emergency SOS

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/sos/alerts` | optional | Broadcast an active SOS location to nearby clients (201) |
| GET | `/sos/alerts/nearby` | no | Active alerts visible near a latitude/longitude |
| PATCH | `/sos/alerts/{alert_id}/resolve` | optional | Stop sharing an alert; requires the creator's `client_id` or user |

Create body:

```json
{
  "latitude": 9.03,
  "longitude": 38.74,
  "radius_meters": 2000,
  "reason": "Harassed on the way home",
  "client_id": "device-abc",
  "share_token": "share_...",
  "valid_hours": 3
}
```

Alerts expire after `valid_hours` and are listed only to clients searching inside
the broadcast radius. The web client opens the device SMS app with a prefilled
tracking link; browsers cannot send SMS silently without an SMS gateway.

## Contacts

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/contacts` | yes | Add a trusted contact (201) |
| GET | `/contacts` | yes | List own contacts |
| DELETE | `/contacts/{contact_id}` | yes | Remove a contact (204) |

## SOS alerts

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/sos` | yes | Record an SOS alert (201) |
| GET | `/sos/mine` | yes | List your recent SOS alerts |

Create body:

```json
{
  "location": [38.74, 9.03],
  "reason": "Feeling unsafe near the station",
  "voice_attached": false,
  "picture_name": null
}
```

Alerts are persisted with status `active`. The scaffold logs a simulated contact
notification; it does **not** send SMS, email, push, or contact emergency services.

## Pagination

List endpoints accept `limit` (1–100, default 25) and `offset` (default 0) and return
`{items, total, limit, offset}`.
