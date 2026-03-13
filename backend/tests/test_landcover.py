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


def test_landcover_volumetric_endpoint_ok(monkeypatch):
    def fake_get_landcover_volumetric_geojson(**kwargs):
        assert kwargs["classification_id"] == "abc123def4567890"
        assert kwargs["scale"] == 30
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "class_id": 3,
                        "class_name": "Vegetacao",
                        "area_ha": 1.25,
                        "height_m": 15.0,
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-43.2, -22.9],
                                [-43.2, -22.89],
                                [-43.19, -22.89],
                                [-43.19, -22.9],
                                [-43.2, -22.9],
                            ]
                        ],
                    },
                }
            ],
            "metadata": {"classification_id": "abc123def4567890", "features_count": 1},
        }

    monkeypatch.setattr(
        "backend.routers.landcover.get_landcover_volumetric_geojson",
        fake_get_landcover_volumetric_geojson,
    )

    app = _build_app()
    client = TestClient(app)
    response = client.get(
        "/analysis/landcover/volumetric?classification_id=abc123def4567890&scale=30"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert body["metadata"]["features_count"] == 1
    assert body["features"][0]["properties"]["class_name"] == "Vegetacao"


def test_landcover_vectorize_endpoint_ok(monkeypatch):
    class DummyVectorizeRun:
        vectorization_id = "vec123def4567890"
        feature_collection = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "polygon_id": "vec123-00001",
                        "status": "suggested",
                        "area_ha": 0.45,
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-43.2, -22.9],
                                [-43.2, -22.89],
                                [-43.19, -22.89],
                                [-43.19, -22.9],
                                [-43.2, -22.9],
                            ]
                        ],
                    },
                }
            ],
        }
        summary = {"total_polygons": 1, "total_area_ha": 0.45, "min_area_ha": 0.45, "max_area_ha": 0.45}
        metadata = {"segmentation_method": "SNIC", "features_count": 1}
        params_used = {"segment_size": 20}

    def fake_vectorize_landcover_segments(**kwargs):
        assert kwargs["satellite"] == "sentinel2"
        assert kwargs["segment_size"] == 20
        return DummyVectorizeRun()

    monkeypatch.setattr(
        "backend.routers.landcover.vectorize_landcover_segments",
        fake_vectorize_landcover_segments,
    )

    app = _build_app()
    client = TestClient(app)
    payload = {
        "aoi": {
            "type": "Polygon",
            "coordinates": [[[-43.2, -22.9], [-43.2, -22.8], [-43.1, -22.8], [-43.1, -22.9], [-43.2, -22.9]]],
        },
        "date_start": "2025-01-01",
        "date_end": "2025-01-31",
        "satellite": "sentinel2",
        "segment_size": 20,
        "mode": "advanced_ai",
    }

    response = client.post("/analysis/landcover/vectorize", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["vectorization_id"] == DummyVectorizeRun.vectorization_id
    assert body["summary"]["total_polygons"] == 1
    assert body["polygons"]["features"][0]["properties"]["status"] == "suggested"


def test_landcover_classify_polygons_endpoint_ok(monkeypatch):
    class DummyRun:
        classification_id = "classpoly1234567890"
        tile_url = "https://tiles.test/class-poly/{z}/{x}/{y}"
        legend = [{"class_id": 3, "class": "Vegetacao Nativa", "color": "#1f7a3e"}]
        class_stats = [{"class_id": 3, "class": "Vegetacao Nativa", "area_ha": 4.2, "color": "#1f7a3e"}]
        download_url = "https://download.test/class-poly.tif"

    class DummyClassifyPolygonsResult:
        classification_run = DummyRun()
        polygons = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "polygon_id": "vec123-00001",
                        "status": "approved",
                        "class_id": 3,
                        "class_name": "Vegetacao Nativa",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-43.2, -22.9],
                                [-43.2, -22.89],
                                [-43.19, -22.89],
                                [-43.19, -22.9],
                                [-43.2, -22.9],
                            ]
                        ],
                    },
                }
            ],
        }
        summary = {"total_polygons": 1, "total_area_ha": 4.2}
        metadata = {"persisted": False}

    def fake_classify_landcover_polygons(**kwargs):
        assert kwargs["satellite"] == "sentinel2"
        assert kwargs["only_statuses"] == ["approved", "edited"]
        return DummyClassifyPolygonsResult()

    monkeypatch.setattr(
        "backend.routers.landcover.classify_landcover_polygons",
        fake_classify_landcover_polygons,
    )

    app = _build_app()
    client = TestClient(app)
    payload = {
        "polygons": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"polygon_id": "vec123-00001", "status": "approved"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-43.2, -22.9],
                                [-43.2, -22.89],
                                [-43.19, -22.89],
                                [-43.19, -22.9],
                                [-43.2, -22.9],
                            ]
                        ],
                    },
                }
            ],
        },
        "date_start": "2025-01-01",
        "date_end": "2025-01-31",
        "satellite": "sentinel2",
        "only_statuses": ["approved", "edited"],
    }

    response = client.post("/analysis/landcover/classify-polygons", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["classification_id"] == DummyRun.classification_id
    assert body["tile_url"] == DummyRun.tile_url
    assert body["summary"]["total_polygons"] == 1
    assert body["polygons"]["features"][0]["properties"]["class_id"] == 3
