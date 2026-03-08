from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.landcover import router as landcover_router


def _build_app():
    app = FastAPI()
    app.include_router(landcover_router)
    return app


def test_landcover_classify_endpoint_ok(monkeypatch):
    class DummyRun:
        classification_id = "abc123def4567890"
        tile_url = "https://tiles.test/{z}/{x}/{y}"
        legend = [{"class_id": 1, "class": "Agricultura", "color": "#f4d03f"}]
        class_stats = [{"class_id": 1, "class": "Agricultura", "area_ha": 12.5, "color": "#f4d03f"}]
        download_url = "https://download.test/result.tif"

    def fake_classify_landcover(**kwargs):
        assert kwargs["satellite"] == "sentinel2"
        return DummyRun()

    monkeypatch.setattr("backend.routers.landcover.classify_landcover", fake_classify_landcover)

    app = _build_app()
    client = TestClient(app)
    payload = {
        "aoi": {"type": "Polygon", "coordinates": [[[-43.2, -22.9], [-43.2, -22.8], [-43.1, -22.8], [-43.1, -22.9], [-43.2, -22.9]]]},
        "training_samples": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [[[-43.2, -22.9], [-43.2, -22.89], [-43.19, -22.89], [-43.19, -22.9], [-43.2, -22.9]]]},
                    "properties": {"class_id": 1},
                }
            ],
        },
        "date_start": "2025-01-01",
        "date_end": "2025-01-31",
        "satellite": "sentinel2",
    }

    response = client.post("/analysis/landcover/classify", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["classification_id"] == DummyRun.classification_id
    assert body["tile_url"] == DummyRun.tile_url
    assert body["export_url"] == DummyRun.download_url


def test_landcover_stats_endpoint_ok(monkeypatch):
    def fake_get_cached_stats(classification_id: str):
        assert classification_id == "abc123def4567890"
        return (
            [{"class_id": 1, "class": "Agricultura", "area_ha": 10.0, "color": "#f4d03f"}],
            [{"class_id": 1, "class": "Agricultura", "color": "#f4d03f"}],
            "2026-03-05T00:00:00Z",
        )

    monkeypatch.setattr("backend.routers.landcover.get_cached_stats", fake_get_cached_stats)

    app = _build_app()
    client = TestClient(app)
    response = client.get("/analysis/landcover/stats?classification_id=abc123def4567890")
    assert response.status_code == 200
    body = response.json()
    assert body["classification_id"] == "abc123def4567890"
    assert len(body["class_stats"]) == 1
    assert len(body["legend"]) == 1
