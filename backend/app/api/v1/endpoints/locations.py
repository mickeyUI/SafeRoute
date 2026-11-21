from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Query, status, HTTPException
from app.schemas.safe_location import (
    SafeLocationGeoJSONCollection,
    SafeLocationGeoJSONFeature
)
from app.services.data_store import data_store

router = APIRouter()

@router.get("/safe", response_model=SafeLocationGeoJSONCollection)
async def get_safe_locations(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_meters: float = Query(default=6000.0, ge=100.0, le=30000.0)
):
    """
    Retrieve verified safe locations (police stations, 24/7 hospitals, pharmacies)
    as a GeoJSON FeatureCollection for interactive map display.
    """
    raw_locations = data_store.get_nearby_safe_locations(
        lat=latitude,
        lon=longitude,
        radius_meters=radius_meters
    )
    features = []
    for loc in raw_locations:
        features.append(SafeLocationGeoJSONFeature(
            type="Feature",
            geometry={
                "type": "Point",
                "coordinates": [loc["longitude"], loc["latitude"]]
            },
            properties={
                "id": str(loc["id"]),
                "name": loc["name"],
                "category": loc["category"],
                "description": loc.get("description"),
                "contact_phone": loc.get("contact_phone"),
                "is_24_7": loc.get("is_24_7", True),
                "verification_status": loc.get("verification_status", "verified")
            }
        ))
    return SafeLocationGeoJSONCollection(type="FeatureCollection", features=features)

@router.get("/nearby")
async def get_nearby_safe_locations_paginated(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    radius_m: float = Query(default=3000.0, gt=0),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    raw_locations = data_store.get_nearby_safe_locations(
        lat=lat,
        lon=lon,
        radius_meters=radius_m
    )
    items = []
    for loc in raw_locations[offset:offset + limit]:
        dist = data_store.haversine_distance(lat, lon, loc["latitude"], loc["longitude"])
        items.append({
            "id": str(loc["id"]),
            "name": loc["name"],
            "category": loc["category"],
            "address": loc.get("address", ""),
            "notes": loc.get("description", ""),
            "location": [loc["longitude"], loc["latitude"]],
            "is_verified": loc.get("verification_status") == "verified",
            "distance_m": round(dist, 1)
        })
    return {
        "items": items,
        "total": len(raw_locations),
        "limit": limit,
        "offset": offset
    }

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_safe_location(payload: Dict[str, Any]):
    return data_store.create_safe_location(payload)

@router.get("")
async def list_safe_locations():
    return list(data_store.safe_locations.values())

@router.get("/{location_id}")
async def get_safe_location(location_id: str):
    loc = data_store.safe_locations.get(location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc
