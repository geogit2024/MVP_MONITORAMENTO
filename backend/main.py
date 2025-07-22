import os
import ee
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import date
import json

# --------------------------------------------------------------------------
# IMPORTAÇÕES PARA BANCO DE DADOS
# --------------------------------------------------------------------------
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, Float, text, select
from sqlalchemy.engine import URL
from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_AsGeoJSON
from dotenv import load_dotenv
from shapely.geometry import shape

# --------------------------------------------------------------------------
# INICIALIZAÇÃO E CONFIGURAÇÃO
# --------------------------------------------------------------------------

# Carrega variáveis de ambiente (do arquivo .env)
load_dotenv()

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

app = FastAPI(
    title="WebGIS MVP API",
    description="API para processamento de imagens de satélite e gerenciamento de propriedades rurais."
)

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
# CONFIGURAÇÃO DO BANCO DE DADOS POSTGRESQL
# --------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌ Variável de ambiente DATABASE_URL não definida. Crie o arquivo .env.")

engine = create_engine(DATABASE_URL)
metadata = MetaData()

# Definição da tabela de propriedades, espelhando os campos do formulário
propriedades_rurais = Table(
    'propriedades_rurais', metadata,
    Column('id', Integer, primary_key=True),
    Column('propriedade_nome', String(255), nullable=False),
    Column('incra_codigo', String(50)),
    Column('municipio', String(100), nullable=False),
    Column('estado', String(50), nullable=False),
    Column('area_total', Float, nullable=False),
    Column('proprietario_nome', String(255), nullable=False),
    Column('cpf_cnpj', String(20), nullable=False, unique=True),
    Column('email', String(100), nullable=False),
    Column('matricula', String(50)),
    Column('ccir', String(50)),
    # --- ALTERAÇÕES ADICIONADAS ABAIXO ---
    Column('doc_identidade_path', String(255), nullable=True),
    Column('doc_terra_path', String(255), nullable=True),
    # --- FIM DAS ALTERAÇÕES ---
    Column('geom', Geometry('POLYGON', srid=4326)),
)

@app.on_event("startup")
async def startup_event():
    """Cria a tabela no banco de dados ao iniciar a API, se ela não existir."""
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT extname FROM pg_extension WHERE extname = 'postgis'"))
            if result.scalar_one_or_none() is None:
                 print("🔴 ALERTA: Extensão PostGIS não encontrada no banco. A API pode falhar.")
                 print("   -> Conecte-se ao seu DB e execute: CREATE EXTENSION postgis;")
        metadata.create_all(engine)
        print("✅ Tabelas do banco de dados verificadas/criadas com sucesso.")
    except Exception as e:
        print(f"❌ Erro ao conectar ou criar tabelas no banco de dados: {e}")


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

class DownloadInfoRequest(BaseModel):
    imageId: str
    polygon: Dict[str, Any]

class DownloadInfoResponse(BaseModel):
    imageId: str
    downloadUrl: str
    fileName: str

class PropertyCreate(BaseModel):
    propriedade_nome: str
    incra_codigo: Optional[str] = None
    municipio: str
    estado: str
    area_total: float
    proprietario_nome: str
    cpf_cnpj: str
    email: str
    matricula: Optional[str] = None
    ccir: Optional[str] = None
    geometry: Dict[str, Any]

class PropertyDetails(BaseModel):
    id: int
    propriedade_nome: str
    incra_codigo: Optional[str] = None
    municipio: str
    estado: str
    area_total: float
    proprietario_nome: str
    cpf_cnpj: str
    email: str
    matricula: Optional[str] = None
    ccir: Optional[str] = None
    geometry: Dict[str, Any]

class PropertyProperties(BaseModel):
    id: int
    nome: str
    proprietario: str

class PropertyGeoJSON(BaseModel):
    type: str = "Feature"
    geometry: Dict[str, Any]
    properties: PropertyProperties

class FeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[PropertyGeoJSON]

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
    if not polygon_data or 'type' not in polygon_data or 'coordinates' not in polygon_data:
        raise ValueError("Dados do polígono inválidos.")
    return ee.Geometry(polygon_data)

def get_image_bands(image: ee.Image, is_landsat: bool) -> ee.Image:
    if is_landsat:
        optical_bands = image.select('SR_B.').multiply(0.0000275).add(-0.2)
        thermal_bands = image.select('ST_B.*').multiply(0.00341802).add(149.0)
        return image.addBands(optical_bands, overwrite=True).addBands(thermal_bands, overwrite=True)
    else:
        scaled_bands = image.select('B.*').multiply(0.0001)
        return image.addBands(scaled_bands, overwrite=True)

def calculate_indices_gee(image: ee.Image, is_landsat: bool, indices_to_calculate: List[str]) -> Dict[str, ee.Image]:
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
    add_index('MSAVI', '(2 * NIR + 1 - ((2 * NIR + 1)**2 - 8 * (NIR - RED))**0.5) / 2', bands)
    add_index('SR', 'NIR / RED', bands)
    add_index('VARI', '(GREEN - RED) / (GREEN + RED - BLUE)', bands)
    add_index('Green NDVI', '(NIR - GREEN) / (NIR + GREEN)', bands)
    add_index('CI Green', '(NIR / GREEN) - 1', bands)
    add_index('PVI', '(NIR - 0.3 * RED - 0.5)', bands)
    add_index('TSAVI', '(0.9 * (NIR - 0.9 * RED - 3)) / (RED + 0.9 * NIR - 0.9 * 3 + 1.5 * (1 + 0.9**2))', bands)
    add_index('MTVI2', '1.5 * (1.2 * (NIR - GREEN) - 2.5 * (RED - GREEN)) / (((2 * NIR + 1)**2 - (6 * NIR - 5 * RED**0.5) - 0.5))**0.5', bands)
    if not is_landsat:
        add_index('Red-Edge NDVI', '(NIR - RE1) / (NIR + RE1)', bands)
        add_index('CI Red-Edge', '(NIR / RE1) - 1', bands)
        add_index('RTVIcore', '100 * (NIR - RE1) - 10 * (NIR - GREEN)', bands)
    return calculated

# --------------------------------------------------------------------------
# ENDPOINTS DA API
# --------------------------------------------------------------------------

# === ENDPOINTS DE PROPRIEDADES ===
# ✅ Adicione estas importações no topo do seu arquivo main.py
from fastapi import File, UploadFile, Form
import shutil
import uuid

# ✅ Garanta que a pasta de uploads seja criada ao iniciar
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ... (resto do seu código)

@app.post("/api/properties", status_code=201, response_model=PropertyDetails, tags=["Properties"])
def create_property(
    # ✅ A assinatura da função foi alterada.
    # Os campos de texto agora são recebidos com Form(...)
    propriedade_nome: str = Form(...),
    municipio: str = Form(...),
    estado: str = Form(...),
    area_total: float = Form(...),
    proprietario_nome: str = Form(...),
    cpf_cnpj: str = Form(...),
    email: str = Form(...),
    geometry: str = Form(...), # A geometria virá como uma string JSON
    incra_codigo: Optional[str] = Form(None),
    matricula: Optional[str] = Form(None),
    ccir: Optional[str] = Form(None),
    # ✅ Os arquivos são recebidos com UploadFile e File(...)
    doc_identidade: Optional[UploadFile] = File(None),
    doc_terra: Optional[UploadFile] = File(None)
):
    """Recebe os dados do formulário, salva os anexos e persiste no banco de dados."""
    
    # ✅ Bloco para salvar o arquivo de identidade, se ele for enviado
    doc_identidade_path = None
    if doc_identidade and doc_identidade.filename:
        # Gera um nome de arquivo único para evitar sobreposições e problemas de segurança
        unique_filename = f"{uuid.uuid4()}-{doc_identidade.filename}"
        doc_identidade_path = os.path.join(UPLOAD_DIR, unique_filename)
        # Salva o arquivo no disco na pasta 'uploads'
        with open(doc_identidade_path, "wb") as buffer:
            shutil.copyfileobj(doc_identidade.file, buffer)

    # ✅ Bloco para salvar o arquivo do documento da terra, se ele for enviado
    doc_terra_path = None
    if doc_terra and doc_terra.filename:
        unique_filename = f"{uuid.uuid4()}-{doc_terra.filename}"
        doc_terra_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(doc_terra_path, "wb") as buffer:
            shutil.copyfileobj(doc_terra.file, buffer)
            
    try:
        # ✅ Converte a string da geometria de volta para um dicionário Python
        geom_dict = json.loads(geometry)
        geom_shape = shape(geom_dict)
        
        # ✅ A query de inserção agora inclui os caminhos dos arquivos
        insert_query = propriedades_rurais.insert().values(
            propriedade_nome=propriedade_nome,
            incra_codigo=incra_codigo,
            municipio=municipio,
            estado=estado,
            area_total=area_total,
            proprietario_nome=proprietario_nome,
            cpf_cnpj=cpf_cnpj,
            email=email,
            matricula=matricula,
            ccir=ccir,
            geom=f'SRID=4326;{geom_shape.wkt}',
            doc_identidade_path=doc_identidade_path, # Salva o caminho no banco
            doc_terra_path=doc_terra_path           # Salva o caminho no banco
        ).returning(propriedades_rurais.c.id)

        with engine.connect() as connection:
            transaction = connection.begin()
            result = connection.execute(insert_query)
            new_id = result.scalar_one()
            transaction.commit()
            
            # Busca os dados completos para retornar o objeto criado
            return get_property_by_id(new_id)

    except Exception as e:
        print(f"❌ Erro ao salvar propriedade: {e}")
        if "UniqueViolation" in str(e) or "duplicate key value" in str(e):
            raise HTTPException(status_code=409, detail="Já existe uma propriedade cadastrada com este CPF/CNPJ.")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno ao salvar a propriedade: {e}")
    
@app.get("/api/properties", response_model=FeatureCollection, tags=["Properties"])
def get_all_properties():
    """Retorna todas as propriedades cadastradas como um GeoJSON FeatureCollection."""
    query = select(
        propriedades_rurais.c.id,
        propriedades_rurais.c.propriedade_nome,
        propriedades_rurais.c.proprietario_nome,
        ST_AsGeoJSON(propriedades_rurais.c.geom).label('geometry')
    )
    features = []
    try:
        with engine.connect() as connection:
            results = connection.execute(query).mappings().all()
            for row in results:
                geom_dict = json.loads(row['geometry'])
                features.append({
                    "type": "Feature",
                    "geometry": geom_dict,
                    "properties": {
                        "id": row['id'],
                        "nome": row['propriedade_nome'],
                        "proprietario": row['proprietario_nome']
                    }
                })
        return {"type": "FeatureCollection", "features": features}
    except Exception as e:
        print(f"❌ Erro ao buscar propriedades: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar propriedades.")


@app.get("/api/properties/{property_id}", response_model=PropertyDetails, tags=["Properties"])
def get_property_by_id(property_id: int):
    """Busca e retorna os detalhes completos de uma única propriedade pelo seu ID."""
    query = select(
        propriedades_rurais,
        ST_AsGeoJSON(propriedades_rurais.c.geom).label('geometry_geojson')
    ).where(propriedades_rurais.c.id == property_id)
    try:
        with engine.connect() as connection:
            result = connection.execute(query).mappings().first()
            if result is None:
                raise HTTPException(status_code=404, detail="Propriedade não encontrada.")
            
            property_data = dict(result)
            property_data['geometry'] = json.loads(property_data.pop('geometry_geojson'))
            
            return property_data
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        print(f"❌ Erro ao buscar propriedade por ID: {e}")
        raise HTTPException(status_code=500, detail="Erro interno ao buscar detalhes da propriedade.")


# === ENDPOINTS DO GOOGLE EARTH ENGINE ===
@app.post("/api/earth-images/search", response_model=List[ImageInfo], tags=["Google Earth Engine"])
def search_earth_images(request: SearchRequest):
    """Busca imagens de satélite e retorna metadados e URL de thumbnail."""
    try:
        geometry = create_ee_geometry_from_json(request.polygon)
        collection_name = SATELLITE_COLLECTIONS.get(request.satellite)
        if not collection_name:
            raise HTTPException(status_code=400, detail="Satélite inválido.")
        is_landsat = "LANDSAT" in request.satellite
        cloud_property = 'CLOUD_COVER' if is_landsat else 'CLOUDY_PIXEL_PERCENTAGE'
        image_collection = (
            ee.ImageCollection(collection_name)
            .filterBounds(geometry)
            .filterDate(str(request.dateFrom), str(request.dateTo))
            .filter(ee.Filter.lt(cloud_property, request.cloudPct))
            .sort('system:time_start')
        )
        images_list_info = image_collection.getInfo()['features']
        if not images_list_info:
            return []
        results = []
        vis_params_rgb = {'bands': ['SR_B4', 'SR_B3', 'SR_B2'] if is_landsat else ['B4', 'B3', 'B2'], 'min': 0.0, 'max': 0.3}
        for img_info in images_list_info:
            image_id = img_info['id']
            image = ee.Image(image_id)
            scaled_image = get_image_bands(image, is_landsat)
            dt = date.fromtimestamp(img_info['properties']['system:time_start'] / 1000)
            thumbnail_url = scaled_image.visualize(**vis_params_rgb).getThumbURL({
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

@app.post("/api/earth-images/preview", tags=["Google Earth Engine"])
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
        print(f"❌ Erro ao gerar preview: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao gerar preview: {e}")

@app.post("/api/earth-images/indices", response_model=IndicesResponse, tags=["Google Earth Engine"])
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
        vis_params_index = {'min': 0, 'max': 1, 'palette': ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641']}
        for index_name, index_image in calculated_indices.items():
            clipped_index_image = index_image.clip(geometry)
            map_id = clipped_index_image.getMapId(vis_params_index)
            download_url = clipped_index_image.getDownloadURL({
                'scale': 30, 'crs': 'EPSG:4326', 'region': geometry.bounds(), 'format': 'GEO_TIFF'
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

@app.post("/api/earth-images/change-detection", response_model=ChangeDetectionResponse, tags=["Google Earth Engine"])
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
        change_map = ee.Image(0).where(gain_mask, 2).where(loss_mask, 1).selfMask()
        change_vectors = change_map.reduceToVectors(
            geometry=geometry, scale=30, geometryType='polygon',
            eightConnected=False, labelProperty='change_type', maxPixels=1e10
        )
        change_geojson = change_vectors.getInfo()
        diff_vis_params = {'min': -0.5, 'max': 0.5, 'palette': ['red', '#ffcccb', 'white', '#90ee90', 'green']}
        diff_map_id = ndvi_difference.clip(geometry).getMapId(diff_vis_params)
        diff_url = diff_map_id['tile_fetcher'].url_format
        return ChangeDetectionResponse(changeGeoJson=change_geojson, differenceImageUrl=diff_url)
    except Exception as e:
        print(f"❌ Erro ao detectar mudanças: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/download-info", response_model=DownloadInfoResponse, tags=["Google Earth Engine"])
def get_download_info(request: DownloadInfoRequest):
    """Gera e retorna uma URL de download para a imagem original (GeoTIFF) recortada pela AOI."""
    try:
        image = ee.Image(request.imageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        clipped_image = image.clip(geometry)
        image_date_str = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd').getInfo()
        file_name = f"{request.imageId.split('/')[-1]}_{image_date_str}.tif"
        download_url = clipped_image.getDownloadURL({
            'scale': 30, 'crs': 'EPSG:4326', 'region': geometry.bounds(), 'format': 'GEO_TIFF'
        })
        return DownloadInfoResponse(
            imageId=request.imageId,
            downloadUrl=download_url,
            fileName=file_name
        )
    except Exception as e:
        print(f"❌ Erro ao gerar URL de download: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno ao obter informações para download: {e}")

@app.get("/api/earth-images/precipitation-tiles", tags=["Google Earth Engine"])
def get_precipitation_tile():
    """Retorna uma camada de precipitação média para um período fixo."""
    try:
        today = ee.Date(date.today())
        start_of_month = today.update(day=1)
        end_of_month = start_of_month.advance(1, 'month')
        image = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start_of_month, end_of_month).mean()
        vis_params = {'min': 0, 'max': 50, 'palette': ['white', 'blue', 'purple']}
        map_id_dict = image.visualize(**vis_params).getMapId()
        return {"tileUrl": map_id_dict['tile_fetcher'].url_format}
    except Exception as e:
        print(f"❌ Erro ao gerar camada de precipitação: {e}")
        raise HTTPException(status_code=500, detail=str(e))