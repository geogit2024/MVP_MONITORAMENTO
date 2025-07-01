# backend/main.py

import os
import ee
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
class ChangeDetectionRequest(BaseModel): beforeImageId: str; afterImageId: str; satellite: str; polygon: dict
class ChangeDetectionResponse(BaseModel): changeGeoJson: Dict[str, Any]
class BulkDownloadRequest(BaseModel): imageIds: List[str]; satellite: str; polygon: dict
class DownloadLink(BaseModel): fileName: str; downloadUrl: str
class BulkDownloadResponse(BaseModel): downloads: List[DownloadLink]

class IndicesRequest(BaseModel):
    imageId: str
    satellite: str
    polygon: dict
    indices: List[str]

class IndexResult(BaseModel):
    indexName: str
    imageUrl: str
    downloadUrl: str

class IndicesResponse(BaseModel):
    bounds: List[List[float]]
    results: List[IndexResult]

# --------------------------------------------------------------------------
# FUNÇÕES AUXILIARES
# --------------------------------------------------------------------------
SATELLITE_COLLECTIONS = { "LANDSAT_8": "LANDSAT/LC08/C02/T1_L2", "LANDSAT_9": "LANDSAT/LC09/C02/T1_L2", "SENTINEL_2A": "COPERNICUS/S2_SR_HARMONIZED", "SENTINEL_2B": "COPERNICUS/S2_SR_HARMONIZED" }

def create_ee_geometry_from_json(polygon_data: dict) -> ee.Geometry:
    if not polygon_data or 'type' not in polygon_data or 'coordinates' not in polygon_data:
        raise ValueError("Dados do polígono inválidos.")
    return ee.Geometry(polygon_data)

def get_image_bands(image: ee.Image, is_landsat: bool) -> Dict[str, ee.Image]:
    """Aplica fatores de escala e retorna um dicionário de bandas padronizadas."""
    if is_landsat:
        image = image.select('SR_B.').multiply(0.0000275).add(-0.2)

    bands = {
        'blue': image.select('SR_B2' if is_landsat else 'B2'),
        'green': image.select('SR_B3' if is_landsat else 'B3'),
        'red': image.select('SR_B4' if is_landsat else 'B4'),
        'nir': image.select('SR_B5' if is_landsat else 'B8'),
        'swir1': image.select('SR_B6' if is_landsat else 'B11'),
        'red_edge_1': image.select('B5') if not is_landsat else None,
        'red_edge_2': image.select('B6') if not is_landsat else None,
        'red_edge_3': image.select('B7') if not is_landsat else None
    }
    return bands

def calculate_indices_gee(image: ee.Image, is_landsat: bool, indices_to_calculate: List[str]) -> Dict[str, ee.Image]:
    """Calcula uma lista de índices de vegetação para a imagem fornecida."""
    bands = get_image_bands(image, is_landsat)
    b = bands
    calculated = {}

    def add_index(name, calculation):
        if name in indices_to_calculate:
            calculated[name] = calculation.rename(name.replace(" ", "_"))

    # Fórmulas dos Índices
    if b['nir'] and b['red']:
        add_index('NDVI', (b['nir'].subtract(b['red'])).divide(b['nir'].add(b['red'])))
        add_index('SR', b['nir'].divide(b['red']))
        add_index('SAVI', (b['nir'].subtract(b['red'])).divide(b['nir'].add(b['red']).add(0.5)).multiply(1.5))
        add_index('MSAVI', (b['nir'].multiply(2).add(1).subtract(((b['nir'].multiply(2).add(1)).pow(2)).subtract((b['nir'].subtract(b['red'])).multiply(8)).sqrt())).divide(2))
        add_index('PVI', b['nir'].subtract(b['red'].multiply(0.3)).subtract(0.5))
    if b['nir'] and b['green']:
        add_index('Green NDVI', (b['nir'].subtract(b['green'])).divide(b['nir'].add(b['green'])))
        add_index('CI Green', (b['nir'].divide(b['green'])).subtract(1))
    if b['green'] and b['red'] and b['blue']:
         add_index('VARI', (b['green'].subtract(b['red'])).divide(b['green'].add(b['red']).subtract(b['blue'])))
    if b['nir'] and b['red'] and b['green']:
         add_index('MTVI2', (b['nir'].multiply(1.5).multiply(b['nir'].multiply(1.2).subtract(b['green'].multiply(2.5))).subtract(b['red'].subtract(b['green']).multiply(2.5))).divide(((b['nir'].multiply(2).add(1)).pow(2)).subtract(b['nir'].multiply(6).subtract(b['red'].sqrt().multiply(5))).subtract(0.5).sqrt()))
    if not is_landsat:
        if b['red_edge_1'] and b['nir']:
            add_index('Red-Edge NDVI', (b['nir'].subtract(b['red_edge_1'])).divide(b['nir'].add(b['red_edge_1'])))
            add_index('CI Red-Edge', (b['nir'].divide(b['red_edge_1'])).subtract(1))
        if b['red_edge_1'] and b['nir'] and b['green']:
            add_index('RTVIcore', (b['nir'].subtract(b['red_edge_1']).multiply(100)).subtract((b['nir'].subtract(b['green'])).multiply(10)))

    return calculated

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
            img_to_vis = get_image_bands(img, is_landsat)
            visualized_image = ee.Image.cat(img_to_vis['red'], img_to_vis['green'], img_to_vis['blue']).visualize(**vis_params)
            url = visualized_image.getThumbURL({"region": thumb_region, "dimensions": 256, "format": "png"})
            results.append({
                "id": img.id().getInfo().split('/')[-1],
                "date": ee.Date(img.get("system:time_start")).format("YYYY-MM-dd").getInfo(),
                "thumbnailUrl": url
            })
        return results
    except Exception as e:
        print(f"❌ Erro em /search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/earth-images/indices", response_model=IndicesResponse)
def get_vegetation_indices(req: IndicesRequest):
    try:
        geom = create_ee_geometry_from_json(req.polygon)
        collection_path = SATELLITE_COLLECTIONS[req.satellite]
        full_asset_id = f"{collection_path}/{req.imageId}"
        image = ee.Image(full_asset_id)
        is_landsat = req.satellite.startswith("LANDSAT")
        indices = calculate_indices_gee(image, is_landsat, req.indices)
        if not indices:
            raise HTTPException(status_code=400, detail="Nenhum índice pôde ser calculado. Verifique a compatibilidade do satélite.")
        results = []
        vis_params = {'min': -1, 'max': 1, 'palette': ['#d73027', '#ffffbf', '#1a9850']}
        bounds_geometry = geom.bounds()
        for name, index_image in indices.items():
            clipped_index = index_image.clip(geom)
            results.append({
                "indexName": name,
                "imageUrl": clipped_index.visualize(**vis_params).getThumbURL({"region": bounds_geometry, "dimensions": 1024, "format": "png"}),
                "downloadUrl": clipped_index.getDownloadURL({"name": f"{name}_{req.imageId}", "region": geom, "scale": 10, "format": "GeoTIFF"})
            })
        bounds_coords_list = bounds_geometry.getInfo()['coordinates'][0]
        lons, lats = [c[0] for c in bounds_coords_list], [c[1] for c in bounds_coords_list]
        leaflet_bounds = [[min(lats), min(lons)], [max(lats), max(lons)]]
        return IndicesResponse(bounds=leaflet_bounds, results=results)
    except Exception as e:
        print(f"❌ Erro em /indices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/earth-images/change-detection", response_model=ChangeDetectionResponse)
def detect_changes(req: ChangeDetectionRequest):
    try:
        geom = create_ee_geometry_from_json(req.polygon)
        is_landsat = req.satellite.startswith("LANDSAT")
        collection_path = SATELLITE_COLLECTIONS[req.satellite]
        image_before = ee.Image(f"{collection_path}/{req.beforeImageId}")
        image_after = ee.Image(f"{collection_path}/{req.afterImageId}")
        ndvi_before = calculate_indices_gee(image_before, is_landsat, ['NDVI'])['NDVI']
        ndvi_after = calculate_indices_gee(image_after, is_landsat, ['NDVI'])['NDVI']
        ndvi_diff = ndvi_after.subtract(ndvi_before)
        gain_loss_mask = ee.Image(0).where(ndvi_diff.gt(0.1), 1).where(ndvi_diff.lt(-0.1), 2).selfMask()
        image_for_reduction = gain_loss_mask.addBands(gain_loss_mask)
        vectors = image_for_reduction.reduceToVectors(
            geometry=geom, scale=10, geometryType='polygon',
            eightConnected=False, labelProperty='label', reducer=ee.Reducer.first()
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
            if is_landsat:
                img = get_image_bands(img, is_landsat)
                img = ee.Image.cat(list(img.values()))
            url = img.clip(geom).getDownloadURL({"name": f"GEE_{image_id}", "region": geom, "scale": 10, "format": "GeoTIFF"})
            links.append({"fileName": f"{image_id}.tif", "downloadUrl": url})
        return {"downloads": links}
    except Exception as e:
        print(f"❌ Erro em /download-bulk: {e}")
        raise HTTPException(status_code=500, detail=str(e))