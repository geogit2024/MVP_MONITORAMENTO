# backend/main.py

import os
import ee
import tempfile
import shutil
import zipfile
import time
import requests
import base64
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any
from datetime import date

# --------------------------------------------------------------------------
# INICIALIZAÇÃO E CONFIGURAÇÃO
# --------------------------------------------------------------------------
def init_earth_engine():
    try:
        ee.Initialize(project='charged-polymer-442201-t5')
        print("✅ Earth Engine inicializado com credenciais de ambiente.")
    except Exception:
        print("⚠️  Credenciais de ambiente não encontradas. Tentando com ficheiro de serviço...")
        cred_path = os.getenv("EE_CREDENTIALS_PATH", r"C:\RKSISTEMAS\DEV\MVP\webgis-mvp\backend\credentials\credentials.json")
        service_account = "gee-service@charged-polymer-442201-t5.iam.gserviceaccount.com"
        if not os.path.isfile(cred_path): raise RuntimeError(f"❌ Ficheiro de credenciais não encontrado em: {cred_path}")
        try:
            credentials = ee.ServiceAccountCredentials(service_account, cred_path)
            ee.Initialize(credentials, project='charged-polymer-442201-t5')
            print("✅ Earth Engine inicializado com sucesso via ficheiro de serviço.")
        except Exception as e_inner:
            raise RuntimeError(f"❌ Erro ao inicializar o Earth Engine com ficheiro de serviço:\n{e_inner}")

init_earth_engine()
app = FastAPI()
origins = ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --------------------------------------------------------------------------
# MODELOS PYDANTIC
# --------------------------------------------------------------------------
class SearchRequest(BaseModel): dateFrom: date; dateTo: date; cloudPct: float = Field(..., ge=0, le=100); satellite: str; polygon: dict
class ImageInfo(BaseModel): id: str; date: str; thumbnailUrl: str
class NdviRequest(BaseModel): imageId: str; satellite: str; polygon: dict
class NdviResponse(BaseModel): clippedImageUrl: str; bounds: List[List[float]]; downloadUrl: str
class ChangeDetectionRequest(BaseModel): beforeImageId: str; afterImageId: str; satellite: str; polygon: dict
class ChangeDetectionResponse(BaseModel): changeGeoJson: Dict[str, Any]
class BulkDownloadRequest(BaseModel): imageIds: List[str]; satellite: str; polygon: dict
class DownloadLink(BaseModel): fileName: str; downloadUrl: str
class BulkDownloadResponse(BaseModel): downloads: List[DownloadLink]

# --------------------------------------------------------------------------
# FUNÇÕES AUXILIARES
# --------------------------------------------------------------------------
SATELLITE_COLLECTIONS = { "LANDSAT_8": "LANDSAT/LC08/C02/T1_L2", "LANDSAT_9": "LANDSAT/LC09/C02/T1_L2", "SENTINEL_2A": "COPERNICUS/S2_SR_HARMONIZED", "SENTINEL_2B": "COPERNICUS/S2_SR_HARMONIZED" }

def apply_landsat_scale_factors(image):
    return image.addBands(image.select('SR_B.').multiply(0.0000275).add(-0.2), None, True)

def get_ndvi(image, is_landsat):
    image_scaled = ee.Image(ee.Algorithms.If(is_landsat, apply_landsat_scale_factors(image), image))
    nir_band = ee.String(ee.Algorithms.If(is_landsat, "SR_B5", "B8"))
    red_band = ee.String(ee.Algorithms.If(is_landsat, "SR_B4", "B4"))
    return image_scaled.normalizedDifference([nir_band, red_band]).rename("NDVI")

def to_2d_coordinates(coords: list) -> list:
    if isinstance(coords, list) and len(coords) > 0:
        if isinstance(coords[0], (int, float)) and len(coords) >= 2: return coords[:2]
        return [to_2d_coordinates(c) for c in coords]
    return coords

def create_ee_geometry_from_json(polygon_data: dict) -> ee.Geometry:
    if not polygon_data or 'type' not in polygon_data or 'coordinates' not in polygon_data:
        raise ValueError("Dados do polígono inválidos.")
    geometry_type = polygon_data['type']
    coords_2d = to_2d_coordinates(polygon_data['coordinates'])
    is_geodesic = False
    if geometry_type == 'Polygon': return ee.Geometry.Polygon(coords_2d, None, is_geodesic)
    if geometry_type == 'MultiPolygon': return ee.Geometry.MultiPolygon(coords_2d, None, is_geodesic)
    raise ValueError(f"Tipo de geometria não suportado: '{geometry_type}'.")

# --------------------------------------------------------------------------
# ENDPOINTS DA API
# --------------------------------------------------------------------------
@app.post("/api/earth-images/search", response_model=List[ImageInfo])
def search_earth_images(req: SearchRequest):
    try:
        geom = create_ee_geometry_from_json(req.polygon)
        is_landsat = req.satellite.startswith("LANDSAT")
        collection_name = SATELLITE_COLLECTIONS[req.satellite]
        rgb_bands = ["SR_B4", "SR_B3", "SR_B2"] if is_landsat else ["B4", "B3", "B2"]
        vis_params = {"min": 0.0, "max": 0.3} if is_landsat else {"min": 0, "max": 3000}
        cloud_property = "CLOUD_COVER" if is_landsat else "CLOUDY_PIXEL_PERCENTAGE"
        collection = ee.ImageCollection(collection_name).filterDate(req.dateFrom.isoformat(), req.dateTo.isoformat()).filterBounds(geom).filter(ee.Filter.lt(cloud_property, req.cloudPct)).sort("system:time_start")
        size = collection.size().getInfo()
        if size == 0: return []
        img_list = collection.toList(min(size, 25))
        results = []
        thumb_region = geom.bounds()
        for i in range(img_list.size().getInfo()):
            img = ee.Image(img_list.get(i))
            img_to_vis = apply_landsat_scale_factors(img) if is_landsat else img
            visualized_image = img_to_vis.visualize(bands=rgb_bands, **vis_params)
            url = visualized_image.getThumbURL({"region": thumb_region, "dimensions": 256, "format": "png"})
            response = requests.get(url)
            if response.status_code != 200:
                print(f"⚠️  Falha ao baixar a miniatura para a imagem {img.id().getInfo()}. Status: {response.status_code}")
                continue
            encoded_string = base64.b64encode(response.content).decode('utf-8')
            final_thumbnail_data = f"data:image/png;base64,{encoded_string}"
            results.append({
                "id": img.id().getInfo().split('/')[-1],
                "date": ee.Date(img.get("system:time_start")).format("YYYY-MM-dd").getInfo(),
                "thumbnailUrl": final_thumbnail_data
            })
        return results
    except Exception as e:
        print(f"❌ Erro em /search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/earth-images/ndvi", response_model=NdviResponse)
def calculate_ndvi(req: NdviRequest):
    try:
        geom = create_ee_geometry_from_json(req.polygon)
        collection_path = SATELLITE_COLLECTIONS[req.satellite]
        full_asset_id = f"{collection_path}/{req.imageId}"
        image = ee.Image(full_asset_id)
        is_landsat = req.satellite.startswith("LANDSAT")
        clipped_ndvi = get_ndvi(image, is_landsat).clip(geom)
        bounds_geometry = geom.bounds()
        bounds_coords_list = bounds_geometry.getInfo()['coordinates'][0]
        lons, lats = [c[0] for c in bounds_coords_list], [c[1] for c in bounds_coords_list]
        leaflet_bounds = [[min(lats), min(lons)], [max(lats), max(lons)]]
        return {
            "clippedImageUrl": clipped_ndvi.visualize(min=-0.5, max=1, palette=['#d73027', '#ffffbf', '#1a9850']).getThumbURL({"region": bounds_geometry, "dimensions": 1024, "format": "png"}),
            "bounds": leaflet_bounds,
            "downloadUrl": clipped_ndvi.getDownloadURL({"name": f"NDVI_{req.imageId}", "region": geom, "scale": 10, "format": "GeoTIFF"})
        }
    except Exception as e:
        print(f"❌ Erro em /ndvi: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/earth-images/change-detection", response_model=ChangeDetectionResponse)
def detect_changes(req: ChangeDetectionRequest):
    try:
        geom = create_ee_geometry_from_json(req.polygon)
        collection_path = SATELLITE_COLLECTIONS[req.satellite]
        before_full_id = f"{collection_path}/{req.beforeImageId}"
        after_full_id = f"{collection_path}/{req.afterImageId}"
        image_before, image_after = ee.Image(before_full_id), ee.Image(after_full_id)
        
        is_landsat = req.satellite.startswith("LANDSAT")
        ndvi_before = get_ndvi(image_before, is_landsat)
        ndvi_after = get_ndvi(image_after, is_landsat)
        ndvi_diff = ndvi_after.subtract(ndvi_before)
        
        # 1 para ganho, 2 para perda
        gain_loss_mask = ee.Image(0).where(ndvi_diff.gt(0.1), 1).where(ndvi_diff.lt(-0.1), 2).selfMask()
        
        # Duplica a banda para satisfazer a exigência de 1+1 bandas do reduceToVectors.
        image_for_reduction = gain_loss_mask.addBands(gain_loss_mask)
        
        vectors = image_for_reduction.reduceToVectors(
            geometry=geom,
            scale=10,
            geometryType='polygon',
            eightConnected=False,
            labelProperty='label',
            reducer=ee.Reducer.first()
        )
        
        def set_change_type(f):
            return f.set('change_type', ee.Algorithms.If(ee.Number(f.get('label')).eq(1), 'gain', 'loss'))

        return {"changeGeoJson": vectors.map(set_change_type).getInfo()}
    except Exception as e:
        print(f"❌ Erro em /change-detection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/earth-images/download-bulk", response_model=BulkDownloadResponse)
def download_bulk(req: BulkDownloadRequest):
    try:
        geom = create_ee_geometry_from_json(req.polygon)
        collection_path = SATELLITE_COLLECTIONS[req.satellite]
        links = []
        is_landsat = req.satellite.startswith("LANDSAT")
        for image_id in req.imageIds:
            full_asset_id = f"{collection_path}/{image_id}"
            img = ee.Image(full_asset_id)
            if is_landsat: img = apply_landsat_scale_factors(img)
            url = img.clip(geom).getDownloadURL({"name": f"GEE_{image_id}", "region": geom, "scale": 10, "format": "GeoTIFF"})
            links.append({"fileName": f"{image_id}.tif", "downloadUrl": url})
        return {"downloads": links}
    except Exception as e:
        print(f"❌ Erro em /download-bulk: {e}")
        raise HTTPException(status_code=500, detail=str(e))