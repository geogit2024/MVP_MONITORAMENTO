import os
import ee
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import date
import json
import asyncio # Importar asyncio para o tratamento de CancelledError

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
    Column('doc_identidade_path', String(255), nullable=True),
    Column('doc_terra_path', String(255), nullable=True),
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

# ALTERAÇÃO: Adicionado campo 'classification' para receber dados de quantificação
class IndexResult(BaseModel):
    indexName: str
    imageUrl: str
    downloadUrl: str
    classification: Optional[Dict[str, Any]] = None

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
    gainAreaHa: float
    lossAreaHa: float

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
    geometry: Dict[str, Any] # Geometria como um objeto GeoJSON

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
    geometry: Dict[str, Any] # Geometria como um objeto GeoJSON
    doc_identidade_path: Optional[str] = None
    doc_terra_path: Optional[str] = None

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
        'RE1': scaled_image.select('B5') if not is_landsat else ee.Image(0).rename('B5'),
        'RE2': scaled_image.select('B6') if not is_landsat else ee.Image(0).rename('B6'),
        'RE3': scaled_image.select('B7') if not is_landsat else ee.Image(0).rename('B7'),
    }

    add_index('NDVI', '(NIR - RED) / (NIR + RED)', bands)
    add_index('SAVI', '((NIR - RED) / (NIR + RED + 0.5)) * 1.5', bands)
    add_index('MSAVI', '(2 * NIR + 1 - ((2 * NIR + 1)**2 - 8 * (NIR - RED))**0.5) / 2', bands)
    add_index('SR', 'NIR / RED', bands)
    add_index('VARI', '(GREEN - RED) / (GREEN + RED - BLUE)', bands)
    add_index('Green NDVI', '(NIR - GREEN) / (NIR + GREEN)', bands)
    add_index('CI Green', '(NIR / RE1) - 1', bands)
    add_index('PVI', '(NIR - 0.3 * RED - 0.5)', bands)
    add_index('TSAVI', '(0.9 * (NIR - 0.9 * RED - 3)) / (RED + 0.9 * NIR - 0.9 * 3 + 1.5 * (1 + 0.9**2))', bands)
    add_index('MTVI2', '1.5 * (1.2 * (NIR - GREEN) - 2.5 * (RED - GREEN)) / (((2 * NIR + 1)**2 - (6 * NIR - 5 * RED**0.5) - 0.5))**0.5', bands)
    if not is_landsat:
        add_index('Red-Edge NDVI', '(NIR - RE1) / (NIR + RE1)', bands)
        add_index('CI Red-Edge', '(NIR / RE1) - 1', bands)
        add_index('RTVIcore', '100 * (NIR - RE1) - 10 * (NIR - GREEN)', bands)
    return calculated

# NOVA FUNÇÃO: Adicionada a função de classificação e quantificação do NDVI
async def classify_and_quantify_ndvi_all(ndvi_image: ee.Image, geometry: ee.Geometry, pixel_area: float = 900.0, scale: int = 30) -> Dict[str, float]:
    """
    Classifica NDVI em quatro classes e retorna área de cada uma em hectares.
    Esta função foi adaptada para ser assíncrona e não bloquear o servidor.
    """
    # Define as máscaras para cada classe de cobertura do solo
    agua_mask = ndvi_image.lt(0.05)
    solo_mask = ndvi_image.gte(0.05).And(ndvi_image.lt(0.2))
    veg_rala_mask = ndvi_image.gte(0.2).And(ndvi_image.lt(0.5))
    veg_densa_mask = ndvi_image.gte(0.5)

    async def async_sum_mask(mask: ee.Image) -> float:
        """Função auxiliar para executar a redução de forma assíncrona."""
        # A função de redução do GEE é bloqueante, então a executamos em um thread separado
        def blocking_reduce():
            # A máscara já tem valor 1 onde a condição é verdadeira, e 0 (ou mascarado) onde é falsa.
            # O redutor 'sum()' irá somar esses '1's, resultando na contagem de pixels.
            # A banda do NDVI é renomeada para 'NDVI', então o resultado estará sob essa chave.
            result = mask.rename('NDVI').reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=geometry,
                scale=scale,
                maxPixels=1e10
            ).getInfo()
            # Retorna a contagem de pixels, ou 0 se a chave não for encontrada
            return result.get('NDVI', 0)
        
        # Executa a função bloqueante em um thread separado e aguarda o resultado
        return await asyncio.to_thread(blocking_reduce)

    # Executa todas as contagens de pixels concorrentemente
    agua_count, solo_count, veg_rala_count, veg_densa_count = await asyncio.gather(
        async_sum_mask(agua_mask),
        async_sum_mask(solo_mask),
        async_sum_mask(veg_rala_mask),
        async_sum_mask(veg_densa_mask)
    )

    # Calcula a área em hectares para cada classe
    # Área (ha) = (número de pixels * área de um pixel em m²) / 10000 m²/ha
    area_agua = (agua_count * pixel_area) / 10000
    area_solo_exposto = (solo_count * pixel_area) / 10000
    area_vegetacao_rala = (veg_rala_count * pixel_area) / 10000
    area_vegetacao_densa = (veg_densa_count * pixel_area) / 10000

    return {
        "area_agua": area_agua,
        "area_solo_exposto": area_solo_exposto,
        "area_vegetacao_rala": area_vegetacao_rala,
        "area_vegetacao_densa": area_vegetacao_densa
    }

# --------------------------------------------------------------------------
# ENDPOINTS DA API
# --------------------------------------------------------------------------

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/api/properties", status_code=status.HTTP_201_CREATED, response_model=PropertyDetails, tags=["Properties"])
async def create_property(property_data: PropertyCreate):
    """Recebe os dados da propriedade (JSON) e a persiste no banco de dados."""
    try:
        geom_shape = shape(property_data.geometry)
        
        insert_query = propriedades_rurais.insert().values(
            propriedade_nome=property_data.propriedade_nome,
            incra_codigo=property_data.incra_codigo,
            municipio=property_data.municipio,
            estado=property_data.estado,
            area_total=property_data.area_total,
            proprietario_nome=property_data.proprietario_nome,
            cpf_cnpj=property_data.cpf_cnpj,
            email=property_data.email,
            matricula=property_data.matricula,
            ccir=property_data.ccir,
            geom=f'SRID=4326;{geom_shape.wkt}',
            doc_identidade_path=None,
            doc_terra_path=None
        ).returning(propriedades_rurais.c.id)

        with engine.connect() as connection:
            transaction = connection.begin()
            result = connection.execute(insert_query)
            new_id = result.scalar_one()
            transaction.commit()
            
            return await get_property_by_id(new_id)

    except asyncio.CancelledError:
        print("⚠️  Criação de propriedade cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição de criação de propriedade foi cancelada.")
    except Exception as e:
        print(f"❌ Erro ao salvar propriedade: {e}")
        if "UniqueViolation" in str(e) or "duplicate key value" in str(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma propriedade cadastrada com este CPF/CNPJ.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao salvar a propriedade: {e}")

@app.put("/api/properties/{property_id}", response_model=PropertyDetails, tags=["Properties"])
async def update_property(property_id: int, property_update_data: PropertyCreate):
    """Atualiza os dados de uma propriedade rural existente pelo seu ID."""
    try:
        existing_property_query = select(propriedades_rurais.c.id).where(propriedades_rurais.c.id == property_id)
        with engine.connect() as connection:
            existing_id = connection.execute(existing_property_query).scalar_one_or_none()
            if existing_id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propriedade não encontrada.")

        geom_shape = shape(property_update_data.geometry)
        
        update_values = {
            "propriedade_nome": property_update_data.propriedade_nome,
            "incra_codigo": property_update_data.incra_codigo,
            "municipio": property_update_data.municipio,
            "estado": property_update_data.estado,
            "area_total": property_update_data.area_total,
            "proprietario_nome": property_update_data.proprietario_nome,
            "cpf_cnpj": property_update_data.cpf_cnpj,
            "email": property_update_data.email,
            "matricula": property_update_data.matricula,
            "ccir": property_update_data.ccir,
            "geom": f'SRID=4326;{geom_shape.wkt}'
        }

        update_query = propriedades_rurais.update().where(propriedades_rurais.c.id == property_id).values(**update_values)

        with engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(update_query)
            transaction.commit()
            
            return await get_property_by_id(property_id)

    except asyncio.CancelledError:
        print(f"⚠️  Atualização de propriedade (ID: {property_id}) cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição de atualização foi cancelada.")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Erro ao atualizar propriedade (ID: {property_id}): {e}")
        if "UniqueViolation" in str(e) or "duplicate key value" in str(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe outra propriedade cadastrada com este CPF/CNPJ.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao atualizar a propriedade: {e}")

@app.delete("/api/properties/{property_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Properties"])
async def delete_property(property_id: int):
    """Exclui uma propriedade rural existente pelo seu ID."""
    try:
        check_query = select(propriedades_rurais.c.id).where(propriedades_rurais.c.id == property_id)
        with engine.connect() as connection:
            existing_id = connection.execute(check_query).scalar_one_or_none()
            if existing_id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propriedade não encontrada.")

        delete_query = propriedades_rurais.delete().where(propriedades_rurais.c.id == property_id)
        with engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(delete_query)
            transaction.commit()
        return

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Erro ao excluir propriedade (ID: {property_id}): {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao excluir a propriedade: {e}")

@app.get("/api/properties", response_model=FeatureCollection, tags=["Properties"])
async def get_all_properties():
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
    except asyncio.CancelledError:
        print("⚠️  Busca de todas as propriedades cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"❌ Erro ao buscar propriedades: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao buscar propriedades.")

@app.get("/api/properties/{property_id}", response_model=PropertyDetails, tags=["Properties"])
async def get_property_by_id(property_id: int):
    """
    Busca e retorna os detalhes completos de uma única propriedade pelo seu ID.
    """
    query = select(
        propriedades_rurais,
        ST_AsGeoJSON(propriedades_rurais.c.geom).label('geometry_geojson')
    ).where(propriedades_rurais.c.id == property_id)
    try:
        with engine.connect() as connection:
            result = connection.execute(query).mappings().first()
            if result is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propriedade não encontrada.")
            property_data = dict(result)
            geometry_geojson = property_data.pop('geometry_geojson', None)
            if geometry_geojson:
                if isinstance(geometry_geojson, (bytes, bytearray)):
                    geometry_geojson = geometry_geojson.decode('utf-8')
                property_data['geometry'] = json.loads(geometry_geojson)
            else:
                property_data['geometry'] = None
            return PropertyDetails(**property_data)
    except asyncio.CancelledError:
        print(f"⚠️  Busca de propriedade por ID ({property_id}) cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"❌ Erro ao buscar propriedade: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro interno ao buscar propriedade.")

# === ENDPOINTS DO GOOGLE EARTH ENGINE ===
@app.post("/api/earth-images/search", response_model=List[ImageInfo], tags=["Google Earth Engine"])
async def search_earth_images(request: SearchRequest):
    """Busca imagens de satélite e retorna metadados e URL de thumbnail."""
    try:
        geometry = create_ee_geometry_from_json(request.polygon)
        collection_name = SATELLITE_COLLECTIONS.get(request.satellite)
        if not collection_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Satélite inválido.")
        is_landsat = "LANDSAT" in request.satellite
        cloud_property = 'CLOUD_COVER' if is_landsat else 'CLOUDY_PIXEL_PERCENTAGE'
        image_collection = (
            ee.ImageCollection(collection_name)
            .filterBounds(geometry)
            .filterDate(str(request.dateFrom), str(request.dateTo))
            .filter(ee.Filter.lt(cloud_property, request.cloudPct))
            .sort('system:time_start')
        )
        images_info_result = await asyncio.to_thread(image_collection.getInfo)
        images_list_info = images_info_result['features']
        
        if not images_list_info:
            return []
        
        results = []
        vis_params_rgb = {'bands': ['SR_B4', 'SR_B3', 'SR_B2'] if is_landsat else ['B4', 'B3', 'B2'], 'min': 0.0, 'max': 0.3}
        for img_info in images_list_info:
            image_id = img_info['id']
            image = ee.Image(image_id)
            scaled_image = get_image_bands(image, is_landsat)
            dt = date.fromtimestamp(img_info['properties']['system:time_start'] / 1000)
            
            thumbnail_url = await asyncio.to_thread(scaled_image.visualize(**vis_params_rgb).getThumbURL, {
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
    except asyncio.CancelledError:
        print(f"⚠️  Requisição para {request.satellite} (busca de imagens) foi cancelada pelo cliente ou timeout.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        print(f"❌ Erro inesperado na busca de imagens: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/preview", tags=["Google Earth Engine"])
async def get_image_preview_layer(request: ImagePreviewRequest):
    """Gera uma camada de visualização em cores reais para uma imagem específica."""
    try:
        image = ee.Image(request.imageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        is_landsat = "LANDSAT" in request.satellite
        scaled_image = get_image_bands(image, is_landsat)
        vis_params = {'bands': ['SR_B4', 'SR_B3', 'SR_B2'] if is_landsat else ['B4', 'B3', 'B2'], 'min': 0.0, 'max': 0.3}
        clipped_image = scaled_image.clip(geometry)
        visualized_image = clipped_image.visualize(**vis_params)
        map_id = await asyncio.to_thread(visualized_image.getMapId)
        return {"tileUrl": map_id['tile_fetcher'].url_format}
    except asyncio.CancelledError:
        print("⚠️  Geração de preview cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"❌ Erro ao gerar preview: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Erro ao gerar preview: {e}")

# ROTA MODIFICADA: para calcular e retornar a quantificação do NDVI
@app.post("/api/earth-images/indices", response_model=IndicesResponse, tags=["Google Earth Engine"])
async def generate_indices(request: IndicesRequest):
    """Calcula múltiplos índices e retorna URLs para visualização, download e quantificação NDVI."""
    try:
        if not request.indices:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A lista de índices não pode ser vazia.")
        
        is_landsat = "LANDSAT" in request.satellite
        geometry = create_ee_geometry_from_json(request.polygon)
        image = ee.Image(request.imageId)
        calculated_indices = calculate_indices_gee(image, is_landsat, request.indices)
        
        results = []
        vis_params_index = {'min': 0, 'max': 1, 'palette': ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641']}
        
        for index_name, index_image in calculated_indices.items():
            clipped_index_image = index_image.clip(geometry)
            classification_data = None
            
            # --- NOVA LÓGICA DE CLASSIFICAÇÃO NDVI ---
            if index_name.upper() == "NDVI":
                scale = 10 if "SENTINEL" in request.satellite.upper() else 30
                pixel_area = scale * scale  # Área do pixel em m² (10x10=100 para Sentinel, 30x30=900 para Landsat)
                sensor_str = "Sentinel" if "SENTINEL" in request.satellite.upper() else "Landsat"
                
                # Chama a função de quantificação
                ndvi_areas = await classify_and_quantify_ndvi_all(
                    clipped_index_image, geometry, pixel_area=pixel_area, scale=scale
                )
                
                # Adiciona metadados ao resultado
                ndvi_areas.update({
                    "pixel_area_m2": pixel_area,
                    "scale_m": scale,
                    "sensor": sensor_str,
                })
                classification_data = ndvi_areas
            # --- FIM DA NOVA LÓGICA ---

            # Gera URLs de visualização e download
            map_id_task = asyncio.to_thread(clipped_index_image.getMapId, vis_params_index)
            download_url_task = asyncio.to_thread(clipped_index_image.getDownloadURL, {
                'scale': 30, 'crs': 'EPSG:4326', 'region': geometry.bounds(), 'format': 'GEO_TIFF'
            })
            
            map_id, download_url = await asyncio.gather(map_id_task, download_url_task)

            results.append(IndexResult(
                indexName=index_name,
                imageUrl=map_id['tile_fetcher'].url_format,
                downloadUrl=download_url,
                classification=classification_data # Adiciona os dados de classificação ao resultado
            ))
        
        bounds_info = await asyncio.to_thread(geometry.bounds().getInfo)
        
        bounds_for_response = []
        if bounds_info and 'coordinates' in bounds_info and bounds_info['coordinates']:
            bounds_coords = bounds_info['coordinates'][0] 
            bounds_for_response = [[coord[1], coord[0]] for coord in bounds_coords]
        else:
            print("Aviso: Geometria de limites não contém coordenadas válidas. Retornando limites padrão.")
            bounds_for_response = [[-90.0, -180.0], [90.0, 180.0]]

        return IndicesResponse(bounds=bounds_for_response, results=results)

    except asyncio.CancelledError:
        print("⚠️  Geração de índices cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        print(f"❌ Erro inesperado ao gerar índices: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/change-detection", response_model=ChangeDetectionResponse, tags=["Google Earth Engine"])
async def detect_changes(request: ChangeDetectionRequest):
    """Detecta mudanças entre duas imagens, suaviza os polígonos, calcula as áreas e retorna os resultados."""
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

        def smooth_feature(feature):
            return feature.buffer(10, maxError=1).buffer(-10, maxError=1)

        smoothed_vectors = change_vectors.map(smooth_feature)
        gain_polygons = smoothed_vectors.filter(ee.Filter.eq('change_type', 2))
        loss_polygons = smoothed_vectors.filter(ee.Filter.eq('change_type', 1))

        gain_area_value_task = asyncio.to_thread(gain_polygons.geometry().area(maxError=1).divide(10000).getInfo)
        loss_area_value_task = asyncio.to_thread(loss_polygons.geometry().area(maxError=1).divide(10000).getInfo)
        
        gain_area_value, loss_area_value = await asyncio.gather(gain_area_value_task, loss_area_value_task)
        gain_area_value = gain_area_value or 0.0
        loss_area_value = loss_area_value or 0.0

        change_geojson = await asyncio.to_thread(smoothed_vectors.getInfo)

        diff_vis_params = {'min': -0.5, 'max': 0.5, 'palette': ['red', '#ffcccb', 'white', '#90ee90', 'green']}
        diff_map_id = await asyncio.to_thread(ndvi_difference.clip(geometry).getMapId, diff_vis_params)
        diff_url = diff_map_id['tile_fetcher'].url_format

        return ChangeDetectionResponse(
            changeGeoJson=change_geojson, 
            differenceImageUrl=diff_url,
            gainAreaHa=gain_area_value,
            lossAreaHa=loss_area_value
        )
    except asyncio.CancelledError:
        print("⚠️  Detecção de mudanças cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"❌ Erro ao detectar mudanças: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/download-info", response_model=DownloadInfoResponse, tags=["Google Earth Engine"])
async def get_download_info(request: DownloadInfoRequest):
    """Gera e retorna uma URL de download para a imagem original (GeoTIFF) recortada pela AOI."""
    try:
        image = ee.Image(request.imageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        clipped_image = image.clip(geometry)
        image_date_str = await asyncio.to_thread(ee.Date(image.get('system:time_start')).format('YYYY-MM-dd').getInfo)
        file_name = f"{request.imageId.split('/')[-1]}_{image_date_str}.tif"
        download_url = await asyncio.to_thread(clipped_image.getDownloadURL, {
            'scale': 30, 'crs': 'EPSG:4326', 'region': geometry.bounds(), 'format': 'GEO_TIFF'
        })
        return DownloadInfoResponse(
            imageId=request.imageId,
            downloadUrl=download_url,
            fileName=file_name
        )
    except asyncio.CancelledError:
        print("⚠️  Geração de URL de download cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"❌ Erro ao gerar URL de download: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao obter informações para download: {e}")

@app.get("/api/earth-images/precipitation-tiles", tags=["Google Earth Engine"])
async def get_precipitation_tile():
    """Retorna uma camada de precipitação média para um período fixo."""
    try:
        today = ee.Date(date.today())
        start_of_month = today.update(day=1)
        end_of_month = start_of_month.advance(1, 'month')
        image = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start_of_month, end_of_month).mean()
        vis_params = {'min': 0, 'max': 50, 'palette': ['white', 'blue', 'purple']}
        map_id_dict = await asyncio.to_thread(image.visualize(**vis_params).getMapId)
        return {"tileUrl": map_id_dict['tile_fetcher'].url_format}
    except asyncio.CancelledError:
        print("⚠️  Geração de camada de precipitação cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisição foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"❌ Erro ao gerar camada de precipitação: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))