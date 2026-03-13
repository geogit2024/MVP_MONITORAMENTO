import importlib
import sys
import asyncio

import pytest


@pytest.fixture
def main_module(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")

    import ee

    monkeypatch.setattr(ee, "Initialize", lambda *args, **kwargs: None)

    sys.modules.pop("backend.main", None)
    sys.modules.pop("main", None)

    try:
        module = importlib.import_module("backend.main")
        module_name = "backend.main"
    except ModuleNotFoundError:
        module = importlib.import_module("main")
        module_name = "main"

    yield module

    sys.modules.pop(module_name, None)


def test_extract_numeric_stats(main_module):
    payload = {"NDVI_min": -0.1, "NDVI_max": 0.8, "NDVI_mean": 0.42}
    stats = main_module._extract_numeric_stats(payload, "NDVI")
    assert stats["min"] == -0.1
    assert stats["max"] == 0.8
    assert stats["mean"] == 0.42


def test_json_roundtrip_helpers(main_module):
    original = {"key": "value", "count": 2}
    text = main_module._to_json_text(original)
    parsed = main_module._from_json_text(text, {})
    assert parsed == original


def test_build_context_response_default(main_module):
    reservoir = {"id": 7, "name": "Reservatorio Teste", "geometry": {"type": "Polygon", "coordinates": []}}
    context = main_module._build_context_response(reservoir, None)
    assert context["reservoir_id"] == 7
    assert context["reservatorio_nome"] == "Reservatorio Teste"
    assert context["status_monitoramento"] == "active"
    assert context["geom_monitoramento"] == reservoir["geometry"]


def test_shape_metrics_returns_positive_values(main_module):
    geom = main_module.shape(
        {
            "type": "Polygon",
            "coordinates": [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]],
        }
    )
    metrics = main_module._shape_metrics_ha_km(geom)
    assert metrics["area_ha"] > 0
    assert metrics["perimetro_km"] > 0


def test_build_reservoir_ai_heuristic_mentions_alerts(main_module):
    payload = {
        "alerts": [{"severidade": "high", "mensagem": "Reducao abrupta de area alagada"}],
        "latest_water": {"area_ha": 120.0, "variacao_percentual": -18.5},
        "latest_riparian": {"variacao_pct": -6.2},
        "latest_turbidity": {"valor": 0.18},
    }
    insight = main_module._build_reservoir_ai_heuristic(payload)
    assert "Alerta prioritario" in insight["resumo_executivo"]
    assert "limitacoes" in insight
    assert insight["source"] == "heuristic"


def test_date_to_datetime_end_of_day(main_module):
    dt = main_module._date_to_datetime(main_module.date(2026, 3, 10), end_of_day=True)
    assert dt.hour == 23
    assert dt.minute == 59
    assert dt.second == 59


def test_call_llm_reservoir_insight_fallback_without_api_key(main_module, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("RESERVOIR_AI_PROVIDER", "openai")
    fallback = main_module._build_reservoir_ai_heuristic({"alerts": []})
    output = main_module._call_llm_reservoir_insight({"reservatorio": {"id": 1}}, fallback)
    assert output["source"] == "heuristic"
    assert output["resumo_executivo"] == fallback["resumo_executivo"]


def test_call_llm_reservoir_insight_openai_success(main_module, monkeypatch):
    class DummyResponse:
        ok = True

        @staticmethod
        def json():
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"resumo_executivo":"Resumo tecnico.","diagnostico":"Diagnostico objetivo.",'
                                '"recomendacoes":"Recomendacoes praticas.","confianca":"alta","limitacoes":"Limitacoes declaradas."}'
                            )
                        }
                    }
                ]
            }

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("RESERVOIR_AI_PROVIDER", "openai")
    monkeypatch.setattr(main_module.requests, "post", lambda *args, **kwargs: DummyResponse())

    fallback = main_module._build_reservoir_ai_heuristic({"alerts": []})
    output = main_module._call_llm_reservoir_insight({"reservatorio": {"id": 1}}, fallback)
    assert output["source"] == "openai"
    assert output["confianca"] == "alta"
    assert output["resumo_executivo"] == "Resumo tecnico."


def test_search_request_supports_max_results(main_module):
    payload = main_module.SearchRequest(
        dateFrom=main_module.date(2026, 1, 1),
        dateTo=main_module.date(2026, 1, 31),
        cloudPct=30,
        satellite="SENTINEL_2A",
        polygon={"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
    )
    assert payload.maxResults == 30


def test_reservoir_image_search_request_supports_max_results(main_module):
    payload = main_module.ReservoirImageSearchRequest(
        dateFrom=main_module.date(2026, 1, 1),
        dateTo=main_module.date(2026, 1, 31),
        cloudPct=30,
        satellite="SENTINEL_2A",
    )
    assert payload.maxResults == 30


def test_infer_is_landsat_prefers_image_id_over_hint(main_module):
    assert main_module._infer_is_landsat(
        "LANDSAT/LC08/C02/T1_L2/LC08_001001_20260101",
        "SENTINEL_2A",
    )
    assert not main_module._infer_is_landsat(
        "COPERNICUS/S2_SR_HARMONIZED/20260101T132529_20260101T132523_T22KHF",
        "LANDSAT_9",
    )


def test_is_cbers_identifier_with_image_id_or_hint(main_module):
    assert main_module._is_cbers_identifier("CB4A-WFI-L4-DN-1_20260101_123_456", "SENTINEL_2A")
    assert main_module._is_cbers_identifier("ANY", "CBERS_4A_WFI")


def test_index_result_accepts_download_url_string(main_module):
    result = main_module.IndexResult(
        indexName="NDVI",
        imageUrl="https://tiles.example/{z}/{x}/{y}",
        downloadUrl="https://download.example/ndvi.tif",
    )
    assert result.downloadUrl == "https://download.example/ndvi.tif"


def test_index_result_accepts_download_url_none(main_module):
    result = main_module.IndexResult(
        indexName="NDVI",
        imageUrl="https://tiles.example/{z}/{x}/{y}",
        downloadUrl=None,
    )
    assert result.downloadUrl is None


def test_generate_indices_keeps_result_valid_when_download_unavailable(main_module, monkeypatch):
    class FakeBounds:
        @staticmethod
        def getInfo():
            return {"coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}

    class FakeGeometry:
        @staticmethod
        def bounds(maxError=None):
            _ = maxError
            return FakeBounds()

    class FakeTileFetcher:
        url_format = "https://tiles.example/{z}/{x}/{y}"

    class FakeIndexImage:
        def clip(self, _geometry):
            return self

        @staticmethod
        def getMapId(_vis):
            return {"tile_fetcher": FakeTileFetcher()}

        @staticmethod
        def getDownloadURL(_opts):
            raise RuntimeError("download unavailable")

    async def fake_resolve_is_landsat(_image, _image_id, _satellite):
        return True

    async def fake_classify(*_args, **_kwargs):
        return {"classes": []}

    monkeypatch.setattr(main_module, "_is_cbers_identifier", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(main_module, "create_ee_geometry_from_json", lambda _polygon: FakeGeometry())
    monkeypatch.setattr(main_module.ee, "Image", lambda _image_id: object())
    monkeypatch.setattr(main_module, "_resolve_image_is_landsat", fake_resolve_is_landsat)
    monkeypatch.setattr(main_module, "calculate_indices_gee", lambda *_args, **_kwargs: {"NDVI": FakeIndexImage()})
    monkeypatch.setattr(main_module, "classify_and_quantify_ndvi_all", fake_classify)

    request = main_module.IndicesRequest(
        imageId="LANDSAT/LC09/C02/T1_L2/LC09_001001_20260101",
        satellite="LANDSAT_9",
        polygon={"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
        indices=["NDVI"],
    )
    response = asyncio.run(main_module.generate_indices(request))

    assert response.results
    assert response.results[0].indexName == "NDVI"
    assert response.results[0].imageUrl == "https://tiles.example/{z}/{x}/{y}"
    assert response.results[0].downloadUrl is None


def test_generate_indices_keeps_result_valid_when_download_available(main_module, monkeypatch):
    class FakeBounds:
        @staticmethod
        def getInfo():
            return {"coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}

    class FakeGeometry:
        @staticmethod
        def bounds(maxError=None):
            _ = maxError
            return FakeBounds()

    class FakeTileFetcher:
        url_format = "https://tiles.example/{z}/{x}/{y}"

    class FakeIndexImage:
        def clip(self, _geometry):
            return self

        @staticmethod
        def getMapId(_vis):
            return {"tile_fetcher": FakeTileFetcher()}

        @staticmethod
        def getDownloadURL(_opts):
            return "https://download.example/ndvi.tif"

    async def fake_resolve_is_landsat(_image, _image_id, _satellite):
        return True

    async def fake_classify(*_args, **_kwargs):
        return {"classes": []}

    monkeypatch.setattr(main_module, "_is_cbers_identifier", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(main_module, "create_ee_geometry_from_json", lambda _polygon: FakeGeometry())
    monkeypatch.setattr(main_module.ee, "Image", lambda _image_id: object())
    monkeypatch.setattr(main_module, "_resolve_image_is_landsat", fake_resolve_is_landsat)
    monkeypatch.setattr(main_module, "calculate_indices_gee", lambda *_args, **_kwargs: {"NDVI": FakeIndexImage()})
    monkeypatch.setattr(main_module, "classify_and_quantify_ndvi_all", fake_classify)

    request = main_module.IndicesRequest(
        imageId="LANDSAT/LC09/C02/T1_L2/LC09_001001_20260101",
        satellite="LANDSAT_9",
        polygon={"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
        indices=["NDVI"],
    )
    response = asyncio.run(main_module.generate_indices(request))

    assert response.results
    assert response.results[0].downloadUrl == "https://download.example/ndvi.tif"
