import json
import ee
from google.oauth2 import service_account
from gee_logic import GEELogic

# Carregar o GeoJSON do talhão 4 (que vimos no banco)
GEOJSON_TALHAO_4 = {"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-38.517716,-5.480188],[-38.515206,-5.479633],[-38.514799,-5.4845],[-38.515806,-5.478672],[-38.517716,-5.480188]]]}}

try:
    print("--- DIAGNOSTICO LOCAL GEE ---")
    data = GEELogic.get_ndvi_timeseries(json.dumps(GEOJSON_TALHAO_4))
    if data:
        print(f"Sucesso! Recebidos {len(data)} meses.")
        print(f"Mes 1: {data[0]}")
    else:
        print("Falha! get_ndvi_timeseries retornou None ou vazio.")
except Exception as e:
    print(f"Erro no teste: {e}")
