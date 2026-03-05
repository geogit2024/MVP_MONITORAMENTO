import importlib
import sys

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


def test_remove_z_dimension_uses_transform_when_geometry_has_z(main_module, monkeypatch):
    class DummyGeometry:
        has_z = True

    sentinel_result = object()
    captured = {}

    def fake_transform(func, geom):
        captured["geom"] = geom
        captured["coords"] = func(1, 2, 3)
        return sentinel_result

    monkeypatch.setattr(main_module, "transform", fake_transform)

    result = main_module.remove_z_dimension(DummyGeometry())

    assert result is sentinel_result
    assert captured["coords"] == (1, 2)


def test_remove_z_dimension_returns_same_geometry_without_z(main_module):
    class DummyGeometry:
        has_z = False

    geom = DummyGeometry()

    result = main_module.remove_z_dimension(geom)

    assert result is geom


def test_create_ee_geometry_from_json_validates_required_fields(main_module):
    with pytest.raises(ValueError):
        main_module.create_ee_geometry_from_json({})


def test_create_ee_geometry_from_json_calls_ee_geometry(main_module, monkeypatch):
    payload = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}
    captured = {}

    def fake_geometry(data):
        captured["data"] = data
        return {"wrapped": data}

    monkeypatch.setattr(main_module.ee, "Geometry", fake_geometry)

    result = main_module.create_ee_geometry_from_json(payload)

    assert result == {"wrapped": payload}
    assert captured["data"] == payload


def test_get_image_bands_landsat_applies_optical_and_thermal_scaling(main_module):
    class FakeImage:
        def __init__(self, name="root"):
            self.name = name
            self.selected = []
            self.add_bands_calls = []
            self.multiplies = []
            self.adds = []

        def select(self, pattern):
            child = FakeImage(pattern)
            self.selected.append(pattern)
            return child

        def multiply(self, value):
            self.multiplies.append(value)
            return self

        def add(self, value):
            self.adds.append(value)
            return self

        def addBands(self, other, overwrite=False):
            self.add_bands_calls.append((other.name, overwrite))
            return self

    image = FakeImage()

    result = main_module.get_image_bands(image, is_landsat=True)

    assert result is image
    assert image.selected == ["SR_B.", "ST_B.*"]
    assert image.add_bands_calls == [("SR_B.", True), ("ST_B.*", True)]


def test_get_image_bands_sentinel_applies_single_scaling(main_module):
    class FakeImage:
        def __init__(self, name="root"):
            self.name = name
            self.selected = []
            self.add_bands_calls = []

        def select(self, pattern):
            child = FakeImage(pattern)
            self.selected.append(pattern)
            return child

        def multiply(self, _value):
            return self

        def addBands(self, other, overwrite=False):
            self.add_bands_calls.append((other.name, overwrite))
            return self

    image = FakeImage()

    result = main_module.get_image_bands(image, is_landsat=False)

    assert result is image
    assert image.selected == ["B.*"]
    assert image.add_bands_calls == [("B.*", True)]


def test_calculate_indices_gee_returns_only_requested_indices_for_landsat(main_module, monkeypatch):
    class FakeExpr:
        def __init__(self):
            self.name = None

        def rename(self, name):
            self.name = name
            return self

        def selfMask(self):
            return f"masked:{self.name}"

    class FakeScaledImage:
        def select(self, _band):
            return object()

        def expression(self, _expr, _band_map):
            return FakeExpr()

    monkeypatch.setattr(main_module, "get_image_bands", lambda image, is_landsat: FakeScaledImage())
    monkeypatch.setattr(main_module.ee, "Image", lambda value: FakeExpr())

    result = main_module.calculate_indices_gee(
        image=object(),
        is_landsat=True,
        indices_to_calculate=["NDVI", "Red-Edge NDVI", "SAVI"],
    )

    assert set(result.keys()) == {"NDVI", "SAVI"}
    assert "Red-Edge NDVI" not in result


def test_calculate_indices_gee_includes_red_edge_for_sentinel(main_module, monkeypatch):
    class FakeExpr:
        def __init__(self):
            self.name = None

        def rename(self, name):
            self.name = name
            return self

        def selfMask(self):
            return f"masked:{self.name}"

    class FakeScaledImage:
        def select(self, _band):
            return object()

        def expression(self, _expr, _band_map):
            return FakeExpr()

    monkeypatch.setattr(main_module, "get_image_bands", lambda image, is_landsat: FakeScaledImage())
    monkeypatch.setattr(main_module.ee, "Image", lambda value: FakeExpr())

    result = main_module.calculate_indices_gee(
        image=object(),
        is_landsat=False,
        indices_to_calculate=["NDVI", "Red-Edge NDVI"],
    )

    assert set(result.keys()) == {"NDVI", "Red-Edge NDVI"}
