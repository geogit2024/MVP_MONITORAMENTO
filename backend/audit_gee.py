import json
import ee
from gee_logic import GEELogic

# GeoJSON do Talhão 4
GEOJSON = {"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-38.517716,-5.480188],[-38.515206,-5.479633],[-38.514799,-5.4845],[-38.515806,-5.478672],[-38.517716,-5.480188]]]}}

def audit():
    try:
        GEELogic.initialize()
        roi = ee.Geometry(GEOJSON['geometry'])
        
        print(f"ROI: {roi.centroid().coordinates().getInfo()}")
        
        # Testar disponibilidade por mês (últimos 3 meses)
        now = datetime.datetime.now()
        for i in range(3):
            month_date = now - datetime.timedelta(days=30*i)
            start_date = month_date.replace(day=1).strftime('%Y-%m-%d')
            end_date = (month_date.replace(day=28) + datetime.timedelta(days=4)).replace(day=1).strftime('%Y-%m-%d')
            
            s2_col = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")\
                .filterBounds(roi)\
                .filterDate(start_date, end_date)
            
            count = s2_col.size().getInfo()
            print(f"Período {start_date} a {end_date}: {count} imagens encontradas.")
            
            if count > 0:
                # Verificar se o reduceRegion funciona com escala menor (ex: 10m)
                img = s2_col.median()
                stats = img.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=roi,
                    scale=10,
                    maxPixels=1e9
                ).getInfo()
                print(f"  Stats (10m scale): {stats}")
            
    except Exception as e:
        print(f"Erro na auditoria: {e}")

import datetime
if __name__ == "__main__":
    audit()
