import math
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
from app.schemas.route import (
    RoutePreference,
    SafetyIndicator,
    SafetyFactors,
    RouteOption,
    GeoJSONLineString
)

class SafetyScoringEngine:
    """
    Transparent rule-based safety scoring engine for SafeRoute.
    Computes route risk penalty R and overall cost:
    Route Cost = alpha * D + beta * T + gamma * R
    """

    # Configurable weights for route preferences
    WEIGHTS = {
        RoutePreference.SAFETY: {"alpha": 0.20, "beta": 0.20, "gamma": 0.60},
        RoutePreference.BALANCED: {"alpha": 0.35, "beta": 0.35, "gamma": 0.30},
        RoutePreference.FASTEST: {"alpha": 0.20, "beta": 0.70, "gamma": 0.10},
    }

    # Factor weights for segment risk calculation:
    # Risk = 0.40*I + 0.25*L + 0.20*S + 0.15*A
    FACTOR_WEIGHTS = {
        "incident": 0.40,
        "lighting": 0.25,
        "isolation": 0.20,
        "activity": 0.15
    }

    @staticmethod
    def haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
        """
        Calculate the great circle distance between two points in meters.
        coord: (longitude, latitude)
        """
        lon1, lat1 = coord1
        lon2, lat2 = coord2
        R = 6371000.0  # Earth radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_phi / 2.0) ** 2 +
             math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return R * c

    def min_distance_to_segment(self, point: Tuple[float, float], seg_start: Tuple[float, float], seg_end: Tuple[float, float]) -> float:
        """
        Approximate distance in meters from a point to a line segment.
        """
        d_start = self.haversine_distance(point, seg_start)
        d_end = self.haversine_distance(point, seg_end)
        seg_len = self.haversine_distance(seg_start, seg_end)
        if seg_len < 1.0:
            return d_start
        # Simple conservative estimate: minimum of endpoints and midpoint
        midpoint = ((seg_start[0] + seg_end[0]) / 2.0, (seg_start[1] + seg_end[1]) / 2.0)
        d_mid = self.haversine_distance(point, midpoint)
        return min(d_start, d_end, d_mid)

    def calculate_incident_risk(
        self,
        route_coords: List[List[float]],
        reports: List[Dict[str, Any]],
        buffer_meters: float = 120.0
    ) -> Tuple[float, int, List[str]]:
        """
        Calculates incident risk (0-100) along the route corridor with time-decay.
        Returns: (incident_risk, count_of_nearby_reports, observations)
        """
        if not reports or len(route_coords) < 2:
            return 25.0, 0, ["No community incident reports recorded directly along this path."]

        matched_reports = []
        now = datetime.now(timezone.utc)

        for report in reports:
            rep_coord = (report.get("longitude", 0.0), report.get("latitude", 0.0))
            # Check proximity to any segment of route
            is_near = False
            for i in range(len(route_coords) - 1):
                p1 = (route_coords[i][0], route_coords[i][1])
                p2 = (route_coords[i+1][0], route_coords[i+1][1])
                dist = self.min_distance_to_segment(rep_coord, p1, p2)
                if dist <= buffer_meters:
                    is_near = True
                    break
            
            if is_near:
                matched_reports.append(report)

        if not matched_reports:
            return 20.0, 0, ["Path has clean community reporting history within 120m corridor."]

        total_penalty = 0.0
        observations = []

        for rep in matched_reports:
            sev = float(rep.get("severity", 3))
            # Time decay: reports decay linearly over 90 days down to a 0.25 floor
            created_at = rep.get("created_at")
            decay_factor = 1.0
            if isinstance(created_at, datetime):
                # Ensure timezone-aware comparison
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                age_days = (now - created_at).total_seconds() / 86400.0
                decay_factor = max(0.25, 1.0 - (age_days / 90.0))
            
            category = rep.get("category", "incident").replace("_", " ").title()
            penalty = sev * 12.0 * decay_factor
            total_penalty += penalty
            observations.append(f"{category} (Severity {int(sev)}/5) reported within corridor")

        normalized_risk = min(100.0, total_penalty)
        return normalized_risk, len(matched_reports), observations[:3]

    def calculate_lighting_and_isolation(
        self,
        summary: str,
        departure_hour: Optional[int] = None
    ) -> Tuple[float, float, List[str]]:
        """
        Calculates lighting and isolation risk based on road class heuristic and time-of-day.
        """
        summary_lower = summary.lower()
        observations = []
        is_night = False
        if departure_hour is not None:
            is_night = departure_hour >= 19 or departure_hour < 6

        # Road hierarchy heuristics
        if any(term in summary_lower for term in ["avenue", "ave", "boulevard", "street", "main", "expressway", "road"]):
            lighting_risk = 30.0 if not is_night else 45.0
            isolation_risk = 25.0
            observations.append("Follows arterial avenue with higher public visibility.")
        elif any(term in summary_lower for term in ["alley", "path", "shortcut", "unnamed", "track", "footway"]):
            lighting_risk = 70.0 if not is_night else 85.0
            isolation_risk = 75.0
            observations.append("Contains secondary footways/alleys with limited lighting and sightlines.")
        else:
            lighting_risk = 50.0
            isolation_risk = 50.0
            observations.append("Urban residential streets with moderate pedestrian activity.")

        if is_night:
            lighting_risk = min(100.0, lighting_risk + 15.0)
            isolation_risk = min(100.0, isolation_risk + 10.0)
            observations.append("Nighttime travel factor applied (19:00 - 06:00).")

        return lighting_risk, isolation_risk, observations

    def calculate_safe_havens(
        self,
        route_coords: List[List[float]],
        safe_locations: List[Dict[str, Any]],
        buffer_meters: float = 200.0
    ) -> Tuple[int, float, List[str]]:
        """
        Evaluates nearby verified safe locations (police stations, 24/7 hospitals).
        Reduces composite risk.
        """
        if not safe_locations or len(route_coords) < 2:
            return 0, 0.0, []

        nearby_havens = []
        for loc in safe_locations:
            loc_coord = (loc.get("longitude", 0.0), loc.get("latitude", 0.0))
            is_near = False
            for i in range(len(route_coords) - 1):
                p1 = (route_coords[i][0], route_coords[i][1])
                p2 = (route_coords[i+1][0], route_coords[i+1][1])
                if self.min_distance_to_segment(loc_coord, p1, p2) <= buffer_meters:
                    is_near = True
                    break
            if is_near:
                nearby_havens.append(loc)

        bonus = min(25.0, len(nearby_havens) * 10.0)
        observations = []
        for haven in nearby_havens[:2]:
            observations.append(f"Safe Haven nearby: {haven.get('name', 'Public Safe Station')}")

        return len(nearby_havens), bonus, observations

    def score_route(
        self,
        route_id: str,
        summary: str,
        distance_meters: float,
        duration_seconds: float,
        geometry: GeoJSONLineString,
        reports: List[Dict[str, Any]],
        safe_locations: List[Dict[str, Any]],
        departure_hour: Optional[int] = None
    ) -> SafetyIndicator:
        """
        Evaluates all factors to build a complete SafetyIndicator.
        """
        coords = geometry.coordinates

        # 1. Incident risk
        incident_risk, inc_count, inc_obs = self.calculate_incident_risk(coords, reports)

        # 2. Lighting & Isolation
        lighting_risk, isolation_risk, road_obs = self.calculate_lighting_and_isolation(summary, departure_hour)

        # 3. Activity risk (derived from road visibility and time)
        activity_risk = 35.0 if departure_hour and 8 <= departure_hour <= 18 else 60.0

        # 4. Safe Haven proximity bonus
        haven_count, haven_bonus, haven_obs = self.calculate_safe_havens(coords, safe_locations)

        # 5. Composite Risk Score
        # Formula: 0.40*I + 0.25*L + 0.20*S + 0.15*A - Haven_Bonus
        raw_risk = (
            self.FACTOR_WEIGHTS["incident"] * incident_risk +
            self.FACTOR_WEIGHTS["lighting"] * lighting_risk +
            self.FACTOR_WEIGHTS["isolation"] * isolation_risk +
            self.FACTOR_WEIGHTS["activity"] * activity_risk
        )
        final_risk = max(5.0, min(95.0, raw_risk - haven_bonus))

        # 6. Data Coverage Score (Decoupled from risk score)
        # Higher when we have active community inputs & mapped road metadata
        data_coverage = 70.0
        if inc_count > 0:
            data_coverage = min(95.0, 70.0 + (inc_count * 5.0))
        elif len(reports) == 0:
            # If our DB has zero reports overall, coverage is low
            data_coverage = 40.0

        # 7. Qualitative Risk Level
        if final_risk < 35.0:
            risk_level = "low"
        elif final_risk < 55.0:
            risk_level = "moderate"
        elif final_risk < 75.0:
            risk_level = "elevated"
        else:
            risk_level = "high"

        observations = []
        observations.extend(haven_obs)
        observations.extend(road_obs)
        observations.extend(inc_obs)

        return SafetyIndicator(
            overall_risk_score=round(final_risk, 1),
            risk_level=risk_level,
            data_coverage_score=round(data_coverage, 1),
            incident_count=inc_count,
            safe_haven_count=haven_count,
            factors=SafetyFactors(
                incident_risk=round(incident_risk, 1),
                lighting_risk=round(lighting_risk, 1),
                isolation_risk=round(isolation_risk, 1),
                activity_risk=round(activity_risk, 1),
            ),
            observations=observations[:4],
        )

    def rank_routes(
        self,
        candidate_routes: List[RouteOption],
        preference: RoutePreference
    ) -> List[RouteOption]:
        """
        Ranks candidate routes by Route Cost = alpha*D + beta*T + gamma*R
        """
        if not candidate_routes:
            return []

        min_dist = min(r.distance_meters for r in candidate_routes) or 1.0
        min_time = min(r.duration_seconds for r in candidate_routes) or 1.0

        weights = self.WEIGHTS.get(preference, self.WEIGHTS[RoutePreference.SAFETY])
        alpha = weights["alpha"]
        beta = weights["beta"]
        gamma = weights["gamma"]

        for route in candidate_routes:
            # Normalize distance and time to 0-100 scale
            d_norm = min(100.0, (route.distance_meters / min_dist) * 50.0)
            t_norm = min(100.0, (route.duration_seconds / min_time) * 50.0)
            r_score = route.safety_indicator.overall_risk_score

            cost = (alpha * d_norm) + (beta * t_norm) + (gamma * r_score)
            route.cost_score = round(cost, 1)

        # Sort ascending by cost (lowest cost is preferred)
        return sorted(candidate_routes, key=lambda r: r.cost_score)

safety_engine = SafetyScoringEngine()
