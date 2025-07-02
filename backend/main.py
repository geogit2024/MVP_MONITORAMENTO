import os
import ee
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import date

# --------------------------------------------------------------------------
# INICIALIZAÇÃO E CONFIGURAÇÃO
# --------------------------------------------------------------------------

def init_earth_engine():
    """
    Inicializa o Google Earth Engine, tentando primeiro com as credenciais de ambiente
    e, como alternativa, com um arquivo de conta de serviço.
    """
    try:
        ee.Initialize(project='charged-polymer-442201-t5')
        print("✅ Earth Engine inicializado com credenciais de ambiente.")
    except Exception:
        print("⚠️  Credenciais de ambiente não encontradas. Tentando com ficheiro de serviço...")
        cred_path = os.getenv("EE_CREDENTIALS_PATH", r"C:\\RKSISTEMAS\\DEV\\MVP\\webgis-mvp\\backend\\credentials\\credentials.json")
        service_account = "gee-service@charged-polymer-442201-t5.iam.gserviceaccount.com"
        if not os.path.isfile(cred_path):
            raise RuntimeError(f"❌ Ficheiro de credenciais não encontrado em: {cred_path}")
        try:
            credentials = ee.ServiceAccountCredentials(service_account, cred_path)
            ee.Initialize(credentials, project='charged-polymer-442201-t5')
            print("✅ Earth Engine inicializado com sucesso via ficheiro de serviço.")
        except Exception as e_inner:
            raise RuntimeError(f"❌ Erro ao inicializar o Earth Engine com ficheiro de serviço:\n{e_inner}")

init_earth_engine()

app = FastAPI(title="WebGIS MVP API", description="API para processamento de imagens de satélite com Google Earth Engine.")

# Configuração do CORS para permitir requisições do frontend
origins = ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# MODELOS PYDANTIC (Estrutura de Dados da API)
# --------------------------------------------------------------------------

class SearchRequest(BaseModel):
    dateFrom: date
    dateTo: date
    cloudPct: float = Field(..., ge=0, le=100)
    satellite: str
    polygon: Dict[str, Any]

class ImageInfo(BaseModel):
    id: str
    date: str
    thumbnailUrl: str

class ImagePreviewRequest(BaseModel):
    imageId: str
    satellite: str
    polygon: Dict[str, Any]

class IndicesRequest(BaseModel):
    imageId: str
    satellite: str
    polygon: Dict[str, Any]
    indices: List[str]

class IndexResult(BaseModel):
    indexName: str
    imageUrl: str
    downloadUrl: str

class IndicesResponse(BaseModel):
    bounds: List[List[float]]
    results: List[IndexResult]

class ChangeDetectionRequest(BaseModel):
    beforeImageId: str
    afterImageId: str
    satellite: str
    polygon: Dict[str, Any]
    threshold: Optional[float] = 0.25

class ChangeDetectionResponse(BaseModel):
    changeGeoJson: Dict[str, Any]
    differenceImageUrl: Optional[str] = None

# ✅ REVISÃO: Novos modelos para a funcionalidade de download
class DownloadInfoRequest(BaseModel):
    imageId: str
    polygon: Dict[str, Any]

class DownloadInfoResponse(BaseModel):
    imageId: str
    downloadUrl: str
    fileName: str

# --------------------------------------------------------------------------
# FUNÇÕES AUXILIARES E CONSTANTES DO GEE
# --------------------------------------------------------------------------

SATELLITE_COLLECTIONS = {
    "LANDSAT_8": "LANDSAT/LC08/C02/T1_L2",
    "LANDSAT_9": "LANDSAT/LC09/C02/T1_L2",
    "SENTINEL_2A": "COPERNICUS/S2_SR_HARMONIZED",
    "SENTINEL_2B": "COPERNICUS/S2_SR_HARMONIZED"
}

def create_ee_geometry_from_json(polygon_data: Dict[str, Any]) -> ee.Geometry:
    """Converte um dicionário GeoJSON de polígono em um objeto ee.Geometry."""
    if not polygon_data or 'type' not in polygon_data or 'coordinates' not in polygon_data:
        raise ValueError("Dados do polígono inválidos.")
    return ee.Geometry(polygon_data)

def get_image_bands(image: ee.Image, is_landsat: bool) -> ee.Image:
    """Aplica os fatores de escala corretos para Landsat ou Sentinel-2."""
    if is_landsat:
        optical_bands = image.select('SR_B.').multiply(0.0000275).add(-0.2)
        thermal_bands = image.select('ST_B.*').multiply(0.00341802).add(149.0)
        return image.addBands(optical_bands, overwrite=True).addBands(thermal_bands, overwrite=True)
    else:
        scaled_bands = image.select(['B.*']).multiply(0.0001)
        return image.addBands(scaled_bands, overwrite=True)

def calculate_indices_gee(image: ee.Image, is_landsat: bool, indices_to_calculate: List[str]) -> Dict[str, ee.Image]:
    """Calcula uma lista de índices de vegetação para uma imagem GEE com escala já aplicada."""
    scaled_image = get_image_bands(image, is_landsat)
    calculated = {}

    def add_index(name, expression, band_map):
        if name in indices_to_calculate:
            try:
                index_image = scaled_image.expression(expression, band_map).rename(name).selfMask()
                calculated[name] = index_image
            except Exception as e:
                print(f"Aviso: Não foi possível calcular o índice '{name}'. Erro: {e}")

    bands = {
        'NIR': scaled_image.select('SR_B5' if is_landsat else 'B8'),
        'RED': scaled_image.select('SR_B4' if is_landsat else 'B4'),
        'GREEN': scaled_image.select('SR_B3' if is_landsat else 'B3'),
        'BLUE': scaled_image.select('SR_B2' if is_landsat else 'B2'),
        'RE1': scaled_image.select('B5') if not is_landsat else None,
        'RE2': scaled_image.select('B6') if not is_landsat else None,
        'RE3': scaled_image.select('B7') if not is_landsat else None,
    }

    add_index('NDVI', '(NIR - RED) / (NIR + RED)', bands)
    add_index('SAVI', '((NIR - RED) / (NIR + RED + 0.5)) * 1.5', bands)
    add_index('MSAVI', '(2 * NIR + 1 - sqrt((2 * NIR + 1)**2 - 8 * (NIR - RED))) / 2', bands)
    add_index('SR', 'NIR / RED', bands)
    add_index('VARI', '(GREEN - RED) / (GREEN + RED - BLUE)', bands)
    add_index('Green NDVI', '(NIR - GREEN) / (NIR + GREEN)', bands)
    add_index('CI Green', '(NIR / GREEN) - 1', bands)
    add_index('PVI', '(NIR - 0.3 * RED - 0.5)', bands)
    add_index('TSAVI', '(0.9 * (NIR - 0.9 * RED - 3)) / (RED + 0.9 * NIR - 0.9 * 3 + 1.5 * (1 + 0.9**2))', bands)
    add_index('MTVI2', '1.5 * (1.2 * (NIR - GREEN) - 2.5 * (RED - GREEN)) / sqrt((2 * NIR + 1)**2 - (6 * NIR - 5 * sqrt(RED)) - 0.5)', bands)

    if not is_landsat:
        add_index('Red-Edge NDVI', '(NIR - RE1) / (NIR + RE1)', bands)
        add_index('CI Red-Edge', '(NIR / RE1) - 1', bands)
        add_index('RTVIcore', '100 * (NIR - RE1) - 10 * (NIR - GREEN)', bands)

    return calculated

# --------------------------------------------------------------------------
# ENDPOINTS DA API
# --------------------------------------------------------------------------

@app.post("/api/earth-images/search", response_model=List[ImageInfo])
def search_earth_images(request: SearchRequest):
    """Busca imagens de satélite e retorna metadados e URL de thumbnail."""
    try:
        geometry = create_ee_geometry_from_json(request.polygon)
        collection_id = SATELLITE_COLLECTIONS.get(request.satellite)
        if not collection_id:
            raise HTTPException(status_code=400, detail="Satélite inválido.")

        is_landsat = "LANDSAT" in request.satellite
        cloud_property = 'CLOUD_COVER' if is_landsat else 'CLOUDY_PIXEL_PERCENTAGE'
        
        image_collection = (
            ee.ImageCollection(collection_id)
            .filterBounds(geometry)
            .filterDate(str(request.dateFrom), str(request.dateTo))
            .filter(ee.Filter.lt(cloud_property, request.cloudPct))
            .sort('system:time_start')
        )
        
        images_list_info = image_collection.getInfo()['features']
        
        if not images_list_info:
            return []

        results = []
        vis_params = {'bands': ['SR_B4', 'SR_B3', 'SR_B2'] if is_landsat else ['B4', 'B3', 'B2'], 'min': 0.0, 'max': 0.3}

        for img_info in images_list_info:
            image_id = img_info['id']
            image = ee.Image(image_id)
            scaled_image = get_image_bands(image, is_landsat)
            dt = date.fromtimestamp(img_info['properties']['system:time_start'] / 1000)
            
            thumbnail_url = scaled_image.visualize(**vis_params).getThumbURL({
                'dimensions': 256,
                'region': geometry.bounds(),
                'format': 'jpg'
            })
            
            results.append(ImageInfo(
                id=image_id,
                date=dt.strftime('%d/%m/%Y'),
                thumbnailUrl=thumbnail_url
            ))
            
        return results
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        print(f"❌ Erro inesperado na busca de imagens: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/preview")
def get_image_preview_layer(request: ImagePreviewRequest):
    """Gera uma camada de visualização em cores reais para uma imagem específica."""
    try:
        image = ee.Image(request.imageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        is_landsat = "LANDSAT" in request.satellite
        
        scaled_image = get_image_bands(image, is_landsat)
        vis_params = {'bands': ['SR_B4', 'SR_B3', 'SR_B2'] if is_landsat else ['B4', 'B3', 'B2'], 'min': 0.0, 'max': 0.3}
        
        clipped_image = scaled_image.clip(geometry)
        visualized_image = clipped_image.visualize(**vis_params)
        
        map_id = visualized_image.getMapId()
        return {"tileUrl": map_id['tile_fetcher'].url_format}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar preview: {e}")

@app.post("/api/earth-images/indices", response_model=IndicesResponse)
def generate_indices(request: IndicesRequest):
    """Calcula múltiplos índices e retorna URLs para visualização e download."""
    try:
        if not request.indices:
            raise HTTPException(status_code=400, detail="A lista de índices não pode ser vazia.")
        
        is_landsat = "LANDSAT" in request.satellite
        geometry = create_ee_geometry_from_json(request.polygon)
        image = ee.Image(request.imageId)
        calculated_indices = calculate_indices_gee(image, is_landsat, request.indices)

        results = []
        vis_params = {'min': -0.2, 'max': 1, 'palette': ['#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901', '#66A000', '#529400', '#3E8601', '#207401', '#056201', '#004C00']}
        
        for index_name, index_image in calculated_indices.items():
            clipped_index_image = index_image.clip(geometry)
            map_id = clipped_index_image.getMapId(vis_params)
            
            download_url = clipped_index_image.getDownloadURL({
                'scale': 30, 'crs': 'EPSG:4326', 'region': geometry, 'format': 'GEO_TIFF'
            })
            
            results.append(IndexResult(
                indexName=index_name,
                imageUrl=map_id['tile_fetcher'].url_format,
                downloadUrl=download_url
            ))
            
        bounds_coords = geometry.bounds().getInfo()['coordinates'][0]
        bounds_for_response = [[coord[1], coord[0]] for coord in bounds_coords]

        return IndicesResponse(bounds=bounds_for_response, results=results)

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        print(f"❌ Erro inesperado ao gerar índices: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/change-detection", response_model=ChangeDetectionResponse)
def detect_changes(request: ChangeDetectionRequest):
    """Detecta mudanças entre duas imagens e retorna polígonos e uma camada de diferença."""
    try:
        before_image = ee.Image(request.beforeImageId)
        after_image = ee.Image(request.afterImageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        is_landsat = "LANDSAT" in request.satellite

        before_ndvi = calculate_indices_gee(before_image, is_landsat, ['NDVI'])['NDVI']
        after_ndvi = calculate_indices_gee(after_image, is_landsat, ['NDVI'])['NDVI']
        
        ndvi_difference = after_ndvi.subtract(before_ndvi)

        threshold = request.threshold or 0.25
        gain_mask = ndvi_difference.gt(threshold)
        loss_mask = ndvi_difference.lt(-threshold)
        
        change_map = gain_mask.add(loss_mask.multiply(-1)).selfMask()

        change_vectors = change_map.reduceToVectors(
            geometry=geometry, scale=30, geometryType='polygon',
            eightConnected=False, labelProperty='change_type', maxPixels=1e10
        )
        
        change_geojson = change_vectors.getInfo()

        diff_vis_params = {
            'min': -0.5, 'max': 0.5,
            'palette': ['red', '#ffcccb', 'white', '#90ee90', 'green']
        }
        diff_map_id = ndvi_difference.clip(geometry).getMapId(diff_vis_params)
        diff_url = diff_map_id['tile_fetcher'].url_format

        return ChangeDetectionResponse(changeGeoJson=change_geojson, differenceImageUrl=diff_url)

    except Exception as e:
        print(f"❌ Erro ao detectar mudanças: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno: {e}")

# ✅ REVISÃO: Novo endpoint para obter informações de download
@app.post("/api/earth-images/download-info", response_model=DownloadInfoResponse)
def get_download_info(request: DownloadInfoRequest):
    """
    Gera e retorna uma URL de download para a imagem original (GeoTIFF) recortada pela AOI.
    """
    try:
        image = ee.Image(request.imageId)
        geometry = create_ee_geometry_from_json(request.polygon)

        # Recorta a imagem original pela geometria da AOI
        clipped_image = image.clip(geometry)

        # Gera o nome do arquivo a partir da data da imagem
        image_date_str = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd').getInfo()
        file_name = f"{request.imageId.split('/')[-1]}_{image_date_str}.tif"

        # Gera a URL para download em formato GeoTIFF
        download_url = clipped_image.getDownloadURL({
            'scale': 30,  # Resolução em metros (ajuste conforme necessário)
            'crs': 'EPSG:4326',
            'region': geometry.bounds(),
            'format': 'GEO_TIFF'
        })

        return DownloadInfoResponse(
            imageId=request.imageId,
            downloadUrl=download_url,
            fileName=file_name
        )
    except Exception as e:
        print(f"❌ Erro ao gerar URL de download: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno ao obter informações para download: {e}")


@app.get("/api/earth-images/precipitation-tiles")
def get_precipitation_tile():
    """Retorna uma camada de precipitação média para um período fixo."""
    try:
        # Exemplo com dados do mês atual
        today = ee.Date(date.today())
        start_of_month = today.update(day=1)
        end_of_month = start_of_month.advance(1, 'month')
        
        image = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start_of_month, end_of_month).mean()
        
        vis_params = {'min': 0, 'max': 50, 'palette': ['white', 'blue', 'purple']}
        map_id_dict = image.visualize(**vis_params).getMapId()
        return {"tileUrl": map_id_dict['tile_fetcher'].url_format}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))