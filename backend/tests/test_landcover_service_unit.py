from backend.services.landcover_service import _landuse_height_for_class


def test_landuse_height_mapping_by_name():
    assert _landuse_height_for_class(99, "Vegetacao Nativa") == 15.0
    assert _landuse_height_for_class(99, "Agricultura") == 10.0
    assert _landuse_height_for_class(99, "Area Urbana") == 25.0
    assert _landuse_height_for_class(99, "Solo Exposto") == 5.0
    assert _landuse_height_for_class(99, "Agua") == 2.0
    assert _landuse_height_for_class(99, "Area Degradada") == 8.0


def test_landuse_height_mapping_by_id_fallback():
    assert _landuse_height_for_class(1, "") == 10.0
    assert _landuse_height_for_class(2, "") == 10.0
    assert _landuse_height_for_class(3, "") == 15.0
    assert _landuse_height_for_class(4, "") == 5.0
    assert _landuse_height_for_class(5, "") == 2.0
    assert _landuse_height_for_class(6, "") == 25.0
