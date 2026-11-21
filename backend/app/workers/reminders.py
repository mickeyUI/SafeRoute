"""Placeholder for journey check-in reminders (Phase 5+).

The MVP records `check_in_at` but does not dispatch alerts. A future worker should:

1. Select active journeys with `check_in_at <= now() - interval '10 minutes'`.
2. Load the primary trusted contact.
3. Enqueue an SMS/push notification through a notification provider.
4. Mark the journey as `needs_check_in` or escalate after a second grace period.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def scan_stale_journeys() -> int:
    """Stub entry point for a scheduler; returns the number of journeys found."""
    logger.warning("reminder worker is not implemented in the MVP")
    return 0
