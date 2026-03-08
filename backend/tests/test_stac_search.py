import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

# Mock ee before importing main to avoid Earth Engine auth during tests.
mock_ee = MagicMock()
sys.modules["ee"] = mock_ee

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


def test_search_cbers_stac_integration() -> None:
    search_payload = {
        "dateFrom": "2023-08-01",
        "dateTo": "2023-08-31",
        "cloudPct": 20,
        "satellite": "CBERS_4A_WFI",
        "polygon": {
            "type": "Polygon",
            "coordinates": [[
                [-48.0, -16.0],
                [-47.0, -16.0],
                [-47.0, -15.0],
                [-48.0, -15.0],
                [-48.0, -16.0],
            ]],
        },
    }

    mock_stac_response = {
        "features": [
            {
                "id": "CBERS4A_WFI_20230810_123",
                "properties": {
                    "datetime": "2023-08-10T14:00:00Z",
                    "eo:cloud_cover": 10,
                },
                "assets": {"thumbnail": {"href": "http://inpe.br/thumb1.png"}},
            },
            {
                "id": "CBERS4A_WFI_20230815_456",
                "properties": {
                    "datetime": "2023-08-15T14:00:00Z",
                    "eo:cloud_cover": 80,
                },
                "assets": {"thumbnail": {"href": "http://inpe.br/thumb2.png"}},
            },
        ]
    }

    with patch("main.httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_response_obj = MagicMock()
        mock_response_obj.status_code = 200
        mock_response_obj.json.return_value = mock_stac_response
        mock_response_obj.raise_for_status.return_value = None
        mock_post.return_value = mock_response_obj

        response = client.post("/api/earth-images/search", json=search_payload)

        assert response.status_code == 200
        data = response.json()

        assert len(data) == 1
        image = data[0]
        assert image["id"] == "CBERS4A_WFI_20230810_123"
        assert image["date"] == "10/08/2023"
        assert image["thumbnailUrl"] == "http://inpe.br/thumb1.png"

        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert args[0] == "https://data.inpe.br/bdc/stac/v1/search"
        assert kwargs["json"]["collections"] == ["CB4A-WFI-L2-DN-1"]
