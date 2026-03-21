import json
import ee
import datetime
from gee_logic import GEELogic

GEOJSON = {"type":"Polygon","coordinates":[[[-38.517716,-5.480188],[-38.515206,-5.479633],[-38.514799,-5.4845],[-38.515806,-5.478672],[-38.517716,-5.480188]]]}

def audit_detailed():
    try:
        GEELogic.initialize()
        roi = ee.Geometry(GEOJSON)
        
        now = datetime.datetime.now()
        start_date = (now - datetime.timedelta(days=30)).strftime('%Y-%m-%d')
        end_date = now.strftime('%Y-%m-%d')
        
        print(f"Auditando de {start_date} ate {end_date}")
        
        s2_col = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")\
            .filterBounds(roi)\
            .filterDate(start_date, end_date)
        
        images = s2_col.getInfo()['features']
        print(f"Total de imagens brutas: {len(images)}")
        
        for img_feat in images:
            props = img_feat['properties']
            print(f"Imagem: {props['system:index']} | Nuvens: {props['CLOUDY_PIXEL_PERCENTAGE']}%")
            
        # Tentar reducao real com a melhor imagem (menos nuvens)
        best_img = s2_col.sort('CLOUDY_PIXEL_PERCENTAGE').first()
        if best_img:
            stats = best_img.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=roi,
                scale=10
            ).getInfo()
            print(f"Stats da melhor imagem: {stats}")
            
    except Exception as e:
        print(f"Erro: {e}")

if __name__ == "__main__":
    audit_detailed()
