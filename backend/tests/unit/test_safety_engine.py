from app.schemas.route import GeoJSONLineString, RouteOption, RoutePreference, SafetyIndicator
from app.services.safety_engine import safety_engine


def test_haversine_distance():
    # Piassa (9.035, 38.75) to Arat Kilo (9.033, 38.762) is roughly 1.3 - 1.4 km
    p1 = (38.7500, 9.0350)
    p2 = (38.7620, 9.0330)
    d = safety_engine.haversine_distance(p1, p2)
    assert 1200 < d < 1500


def test_lighting_and_isolation_scoring():
    # Arterial avenue has lower isolation risk than an alley
    l_ave, s_ave, _ = safety_engine.calculate_lighting_and_isolation("Churchill Avenue")
    l_alley, s_alley, _ = safety_engine.calculate_lighting_and_isolation(
        "Narrow unlit alley shortcut"
    )
    assert s_ave < s_alley
    assert l_ave < l_alley


def test_route_ranking_by_safety():
    # Route A: Short but dangerous (high risk 80)
    # Route B: Slightly longer but safe (low risk 20)
    indicator_risky = SafetyIndicator(
        overall_risk_score=80.0,
        risk_level="high",
        data_coverage_score=85.0,
        incident_count=3,
        safe_haven_count=0,
        factors={
            "incident_risk": 80,
            "lighting_risk": 80,
            "isolation_risk": 80,
            "activity_risk": 80,
        },
        observations=["High incident corridor"],
    )
    indicator_safe = SafetyIndicator(
        overall_risk_score=20.0,
        risk_level="low",
        data_coverage_score=80.0,
        incident_count=0,
        safe_haven_count=2,
        factors={
            "incident_risk": 15,
            "lighting_risk": 20,
            "isolation_risk": 25,
            "activity_risk": 20,
        },
        observations=["Safe well lit corridor"],
    )

    opt_risky = RouteOption(
        route_id="r_short_risky",
        summary="Short risky path",
        distance_meters=1000,
        duration_seconds=750,
        cost_score=0,
        safety_indicator=indicator_risky,
        geometry=GeoJSONLineString(coordinates=[[38.75, 9.03], [38.76, 9.03]]),
    )
    opt_safe = RouteOption(
        route_id="r_long_safe",
        summary="Longer safe path",
        distance_meters=1300,
        duration_seconds=980,
        cost_score=0,
        safety_indicator=indicator_safe,
        geometry=GeoJSONLineString(coordinates=[[38.75, 9.03], [38.755, 9.035], [38.76, 9.03]]),
    )

    ranked_safety = safety_engine.rank_routes([opt_risky, opt_safe], RoutePreference.SAFETY)
    # When safety is prioritized, the safer route must rank first
    assert ranked_safety[0].route_id == "r_long_safe"

    ranked_fast = safety_engine.rank_routes([opt_risky, opt_safe], RoutePreference.FASTEST)
    # When speed is prioritized, the shorter route ranks first
    assert ranked_fast[0].route_id == "r_short_risky"

def test_reported_route_corridor_is_high_risk_and_not_preferred():
    from datetime import datetime, timezone
    from app.schemas.route import GeoJSONLineString

    now = datetime.now(timezone.utc)
    # [longitude, latitude] along a straight corridor
    coords = [[38.7500, 9.0350], [38.7600, 9.0350], [38.7700, 9.0350]]
    far_report = {
        "longitude": 38.7600, "latitude": 9.0600, "severity": 3,
        "category": "hazard", "created_at": now,
    }
    near_report = {
        "longitude": 38.7600, "latitude": 9.03505, "severity": 3,
        "category": "harassment", "created_at": now,
    }

    clean_risk, clean_count, _ = safety_engine.calculate_incident_risk(coords, [far_report])
    reported_risk, reported_count, _ = safety_engine.calculate_incident_risk(coords, [near_report])
    assert clean_count == 0
    assert reported_count == 1
    assert reported_risk > clean_risk

    # Even with safe havens nearby, a reported corridor stays high risk.
    indicator = safety_engine.score_route(
        "r_reported", "Market road", 1000, 750,
        GeoJSONLineString(coordinates=coords),
        [near_report],
        [
            {"longitude": 38.7550, "latitude": 9.0350, "name": "Police post"},
            {"longitude": 38.7650, "latitude": 9.0350, "name": "Hospital"},
        ],
        departure_hour=12,
    )
    assert indicator.incident_count == 1
    assert indicator.risk_level == "high"
    assert indicator.overall_risk_score >= 75.0


if __name__ == "__main__":
    test_haversine_distance()
    test_lighting_and_isolation_scoring()
    test_route_ranking_by_safety()
    print("All Safety Engine tests passed successfully!")
