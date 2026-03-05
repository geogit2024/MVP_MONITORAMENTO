import os
import ee
from fastapi import FastAPI, HTTPException, status, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import date, datetime
import json
import asyncio
from contextlib import asynccontextmanager
import requests

# --------------------------------------------------------------------------
# IMPORTAÃ‡Ã•ES PARA BANCO DE DADOS
# --------------------------------------------------------------------------
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, Float, DateTime, Text, text, select
from sqlalchemy.engine import URL
from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_AsGeoJSON
from dotenv import load_dotenv
from shapely.geometry import shape
from shapely.ops import transform

# --------------------------------------------------------------------------
# INICIALIZAÃ‡ÃƒO E CONFIGURAÃ‡ÃƒO
# --------------------------------------------------------------------------

load_dotenv()

# FunÃ§Ã£o para remover a dimensÃ£o Z (altitude) de uma geometria
def remove_z_dimension(geom):
    if geom.has_z:
        return transform(lambda x, y, z=None: (x, y), geom)
    return geom

def init_earth_engine():
    """
    Inicializa o Google Earth Engine.
    """
    try:
        ee.Initialize(project='charged-polymer-442201-t5')
        print("âœ… Earth Engine inicializado com credenciais de ambiente.")
    except Exception:
        print("âš ï¸  Credenciais de ambiente nÃ£o encontradas. Tentando com ficheiro de serviÃ§o...")
        cred_path = os.getenv("EE_CREDENTIALS_PATH", r"C:\\RKSISTEMAS\\DEV\\MVP\\webgis-mvp\\backend\\credentials\\credentials.json")
        service_account = "gee-service@charged-polymer-442201-t5.iam.gserviceaccount.com"
        if not os.path.isfile(cred_path):
            raise RuntimeError(f"âŒ Ficheiro de credenciais nÃ£o encontrado em: {cred_path}")
        try:
            credentials = ee.ServiceAccountCredentials(service_account, cred_path)
            ee.Initialize(credentials, project='charged-polymer-442201-t5')
            print("âœ… Earth Engine inicializado com sucesso via ficheiro de serviÃ§o.")
        except Exception as e_inner:
            raise RuntimeError(f"âŒ Erro ao inicializar o Earth Engine com ficheiro de serviÃ§o:\n{e_inner}")

init_earth_engine()

# --------------------------------------------------------------------------
# CONFIGURAÃ‡ÃƒO DO BANCO DE DADOS POSTGRESQL
# --------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("âŒ VariÃ¡vel de ambiente DATABASE_URL nÃ£o definida. Crie o arquivo .env.")

engine = create_engine(DATABASE_URL)
metadata = MetaData()

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
    Column('geom', Geometry('POLYGON', srid=4326, dimension=2)),
)

talhoes = Table(
    'talhoes', metadata,
    Column('id', Integer, primary_key=True),
    Column('propriedade_id', Integer, nullable=False),
    Column('nome', String(255), nullable=False),
    Column('area', Float, nullable=False),
    Column('cultura_principal', String(255)),
    Column('geometry', Geometry('POLYGON', srid=4326, dimension=2)),
)

reservoirs_table = Table(
    'reservoirs', metadata,
    Column('id', Integer, primary_key=True),
    Column('name', String(255), nullable=False),
    Column('description', String),
    Column('geom', Geometry('POLYGON', srid=4326, dimension=2), nullable=False)
)

agronomo_relatorios = Table(
    'agronomo_relatorios', metadata,
    Column('id', Integer, primary_key=True),
    Column('talhao', String(255), nullable=False),
    Column('area_ha', Float, nullable=False),
    Column('indice', String(50), nullable=False),
    Column('periodo_inicio', String(20), nullable=False),
    Column('periodo_fim', String(20), nullable=False),
    Column('payload_json', Text, nullable=False),
    Column('resposta_json', Text, nullable=False),
    Column('nivel_atencao', String(10), nullable=False),
    Column('created_at', DateTime, nullable=False, default=datetime.utcnow),
)

def run_startup_checks():
    """Cria as tabelas no banco de dados ao iniciar a API, se elas nÃ£o existirem."""
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT extname FROM pg_extension WHERE extname = 'postgis'"))
            if result.scalar_one_or_none() is None:
                print("ðŸ”´ ALERTA: ExtensÃ£o PostGIS nÃ£o encontrada no banco. A API pode falhar.")
                print("   -> Conecte-se ao seu DB e execute: CREATE EXTENSION postgis;")
        metadata.create_all(engine)
        print("âœ… Tabelas do banco de dados verificadas/criadas com sucesso.")
    except Exception as e:
        print(f"âŒ Erro ao conectar ou criar tabelas no banco de dados: {e}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_startup_checks()
    yield


app = FastAPI(
    title="WebGIS MVP API",
    description="API para processamento de imagens de satÃ©lite e gerenciamento de propriedades rurais.",
    lifespan=lifespan,
)

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
class TalhaoCreate(BaseModel):
    nome: str
    area: float
    cultura_principal: Optional[str] = None
    geometry: Dict[str, Any]

class TalhaoDetails(BaseModel):
    id: int
    propriedade_id: int
    nome: str
    area: float
    cultura_principal: Optional[str] = None
    geometry: Dict[str, Any]

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
    totalAreaHa: float

class DownloadInfoRequest(BaseModel):
    imageId: str
    polygon: Dict[str, Any]

class DownloadInfoResponse(BaseModel):
    imageId: str
    downloadUrl: str
    fileName: str

class WmsFeatureInfoRequest(BaseModel):
    layerType: str
    bbox: str
    width: int
    height: int
    x: int
    y: int

class PeriodoAnalise(BaseModel):
    inicio: str
    fim: str

class ValorTemporal(BaseModel):
    data: Optional[str] = None
    valor: float

class EstatisticasIndice(BaseModel):
    min: float
    max: float
    media: float
    tendencia: str
    variacao_percentual: float

class AgronomoRelatorioRequest(BaseModel):
    talhao: str
    area_ha: float
    indice: str
    periodo: PeriodoAnalise
    valores_temporais: List[ValorTemporal] = []
    estatisticas: EstatisticasIndice
    data_pico_vegetativo: Optional[str] = None
    data_queda_brusca: Optional[str] = None

class AgronomoRelatorioResponse(BaseModel):
    id: int
    timestamp: str
    resumo: str
    diagnostico: str
    causas: str
    recomendacoes: str
    nivel_atencao: str

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

class ReservoirCreate(BaseModel):
    name: str
    description: Optional[str] = None
    geometry: Dict[str, Any]

class ReservoirDetails(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    geometry: Dict[str, Any]

# --------------------------------------------------------------------------
# FUNÃ‡Ã•ES AUXILIARES E CONSTANTES DO GEE
# --------------------------------------------------------------------------

SATELLITE_COLLECTIONS = {
    "LANDSAT_8": "LANDSAT/LC08/C02/T1_L2",
    "LANDSAT_9": "LANDSAT/LC09/C02/T1_L2",
    "SENTINEL_2A": "COPERNICUS/S2_SR_HARMONIZED",
    "SENTINEL_2B": "COPERNICUS/S2_SR_HARMONIZED"
}

def create_ee_geometry_from_json(polygon_data: Dict[str, Any]) -> ee.Geometry:
    if not polygon_data or 'type' not in polygon_data or 'coordinates' not in polygon_data:
        raise ValueError("Dados do polÃ­gono invÃ¡lidos.")
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
                print(f"Aviso: NÃ£o foi possÃ­vel calcular o Ã­ndice '{name}'. Erro: {e}")
    
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

async def classify_and_quantify_ndvi_all(
    original_image: ee.Image, 
    ndvi_image: ee.Image,
    geometry: ee.Geometry, 
    pixel_area: float, 
    scale: int, 
    is_landsat: bool
) -> Dict[str, float]:
    scaled_image = get_image_bands(original_image, is_landsat)
    green_band = 'SR_B3' if is_landsat else 'B3'
    nir_band = 'SR_B5' if is_landsat else 'B8'
    red_band = 'SR_B4' if is_landsat else 'B4'
    
    ndwi_image = scaled_image.normalizedDifference([green_band, nir_band]).rename('NDWI')
    water_mask = ndwi_image.gt(0)
    land_mask = water_mask.Not()

    savi_image = scaled_image.expression(
        '((NIR - RED) / (NIR + RED + L)) * (1 + L)', {
            'NIR': scaled_image.select(nir_band),
            'RED': scaled_image.select(red_band),
            'L': 0.5
        }
    ).rename('SAVI')

    savi_land_only = savi_image.updateMask(land_mask)

    solo_mask = savi_land_only.lt(0.25)
    veg_rala_mask = savi_land_only.gte(0.25).And(savi_land_only.lt(0.5))
    veg_densa_mask = savi_land_only.gte(0.5)

    async def async_sum_mask(mask: ee.Image) -> float:
        def blocking_reduce():
            result = mask.rename('classification').reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=geometry,
                scale=scale,
                maxPixels=1e10
            ).getInfo()
            return result.get('classification', 0)
        
        return await asyncio.to_thread(blocking_reduce)

    agua_count, solo_count, veg_rala_count, veg_densa_count = await asyncio.gather(
        async_sum_mask(water_mask),
        async_sum_mask(solo_mask),
        async_sum_mask(veg_rala_mask),
        async_sum_mask(veg_densa_mask)
    )

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

async def classify_and_quantify_savi(
    savi_image: ee.Image, 
    geometry: ee.Geometry, 
    pixel_area: float, 
    scale: int
) -> Dict[str, float]:
    agua_solo_mask = savi_image.lt(0)
    veg_esparsa_mask = savi_image.gte(0).And(savi_image.lt(0.2))
    veg_moderada_mask = savi_image.gte(0.2).And(savi_image.lt(0.5))
    veg_densa_mask = savi_image.gte(0.5)

    async def async_sum_mask(mask: ee.Image) -> float:
        def blocking_reduce():
            result = mask.rename('classification').reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=geometry,
                scale=scale,
                maxPixels=1e10
            ).getInfo()
            return result.get('classification', 0)
        
        return await asyncio.to_thread(blocking_reduce)

    counts = await asyncio.gather(
        async_sum_mask(agua_solo_mask),
        async_sum_mask(veg_esparsa_mask),
        async_sum_mask(veg_moderada_mask),
        async_sum_mask(veg_densa_mask)
    )

    return {
        "area_agua_solo": (counts[0] * pixel_area) / 10000,
        "area_vegetacao_esparsa": (counts[1] * pixel_area) / 10000,
        "area_vegetacao_moderada": (counts[2] * pixel_area) / 10000,
        "area_vegetacao_densa": (counts[3] * pixel_area) / 10000,
    }

async def classify_and_quantify_msavi(
    msavi_image: ee.Image, 
    geometry: ee.Geometry, 
    pixel_area: float, 
    scale: int
) -> Dict[str, float]:
    solo_mask = msavi_image.lt(0.2)
    veg_rala_mask = msavi_image.gte(0.2).And(msavi_image.lt(0.4))
    veg_moderada_mask = msavi_image.gte(0.4).And(msavi_image.lt(0.6))
    veg_densa_mask = msavi_image.gte(0.6)

    async def async_sum_mask(mask: ee.Image) -> float:
        def blocking_reduce():
            result = mask.rename('classification').reduceRegion(reducer=ee.Reducer.sum(), geometry=geometry, scale=scale, maxPixels=1e10).getInfo()
            return result.get('classification', 0)
        return await asyncio.to_thread(blocking_reduce)

    counts = await asyncio.gather(
        async_sum_mask(solo_mask),
        async_sum_mask(veg_rala_mask),
        async_sum_mask(veg_moderada_mask),
        async_sum_mask(veg_densa_mask)
    )

    return {
        "area_solo_exposto": (counts[0] * pixel_area) / 10000,
        "area_vegetacao_rala": (counts[1] * pixel_area) / 10000,
        "area_vegetacao_moderada": (counts[2] * pixel_area) / 10000,
        "area_vegetacao_densa": (counts[3] * pixel_area) / 10000,
    }

async def classify_and_quantify_ndre(
    ndre_image: ee.Image,
    geometry: ee.Geometry,
    pixel_area: float,
    scale: int
) -> Dict[str, float]:
    nao_vegetado_mask = ndre_image.lt(0.2)
    veg_estressada_mask = ndre_image.gte(0.2).And(ndre_image.lt(0.35))
    veg_moderada_mask = ndre_image.gte(0.35).And(ndre_image.lt(0.5))
    veg_densa_mask = ndre_image.gte(0.5)

    async def async_sum_mask(mask: ee.Image) -> float:
        def blocking_reduce():
            result = mask.rename('classification').reduceRegion(reducer=ee.Reducer.sum(), geometry=geometry, scale=scale, maxPixels=1e10).getInfo()
            return result.get('classification', 0)
        return await asyncio.to_thread(blocking_reduce)

    counts = await asyncio.gather(
        async_sum_mask(nao_vegetado_mask),
        async_sum_mask(veg_estressada_mask),
        async_sum_mask(veg_moderada_mask),
        async_sum_mask(veg_densa_mask)
    )

    return {
        "area_nao_vegetada": (counts[0] * pixel_area) / 10000,
        "area_vegetacao_estressada": (counts[1] * pixel_area) / 10000,
        "area_vegetacao_moderada": (counts[2] * pixel_area) / 10000,
        "area_vegetacao_densa": (counts[3] * pixel_area) / 10000,
    }


AGRONOMO_SYSTEM_PROMPT = """
Voce e um agronomo especialista em analise de indices de vegetacao por satelite.
Sua funcao e interpretar dados de NDVI e outros indices para produtores rurais.
Use linguagem simples, objetiva e didatica.
Evite jargoes tecnicos.
Sempre estruture a resposta em JSON com as chaves:
- resumo
- diagnostico
- causas
- recomendacoes
- nivel_atencao (baixo, medio ou alto)
Se houver tendencia de queda acentuada, sinalize possivel estresse vegetal.
Se houver estabilidade alta, indique boa sanidade.
Se houver grande variabilidade, indique heterogeneidade no talhao.
""".strip()


def _heuristic_agronomo_report(payload: AgronomoRelatorioRequest) -> Dict[str, Any]:
    variacao = payload.estatisticas.variacao_percentual
    tendencia = (payload.estatisticas.tendencia or "").lower()
    nivel = "baixo"
    if variacao <= -20 or "queda" in tendencia:
        nivel = "alto"
    elif variacao < -8 or "instavel" in tendencia:
        nivel = "medio"

    resumo = (
        f"O talhao {payload.talhao} apresentou {payload.indice} com media "
        f"{payload.estatisticas.media:.3f} no periodo {payload.periodo.inicio} a {payload.periodo.fim}."
    )
    diagnostico = (
        "Ha indicios de estresse vegetal e perda de vigor."
        if nivel != "baixo"
        else "A area apresenta comportamento estavel, sem sinais fortes de estresse."
    )
    causas = (
        "As causas provaveis incluem variacao hidrica, nutricional ou pressao de pragas."
        if nivel != "baixo"
        else "As variacoes observadas parecem dentro do padrao esperado para o periodo."
    )
    recomendacoes = (
        "Priorize vistoria de campo em pontos com pior desempenho, confira umidade do solo, "
        "adubacao e sinais de pragas/doencas. Reavalie em 7 a 15 dias."
        if nivel != "baixo"
        else "Mantenha o manejo atual e continue monitorando com imagens e observacao de campo."
    )
    return {
        "resumo": resumo,
        "diagnostico": diagnostico,
        "causas": causas,
        "recomendacoes": recomendacoes,
        "nivel_atencao": nivel,
    }


def _call_openai_agronomo(payload: AgronomoRelatorioRequest) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    if not api_key:
        return _heuristic_agronomo_report(payload)

    user_content = json.dumps(payload.model_dump(), ensure_ascii=False, indent=2)
    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": AGRONOMO_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        json=body,
        timeout=60,
    )
    if not response.ok:
        detail = (response.text or "")[:500]
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao consultar OpenAI: {response.status_code} - {detail}",
        )
    parsed = response.json()
    content = (
        parsed.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "{}")
    )
    try:
        report = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="A resposta da IA nao retornou JSON valido.",
        )

    for key in ["resumo", "diagnostico", "causas", "recomendacoes", "nivel_atencao"]:
        report.setdefault(key, "")
    nivel = str(report.get("nivel_atencao", "medio")).strip().lower()
    if nivel not in {"baixo", "medio", "alto"}:
        nivel = "medio"
    report["nivel_atencao"] = nivel
    return report


# --------------------------------------------------------------------------
# ENDPOINTS DA API
# --------------------------------------------------------------------------

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.post("/api/wms/feature-info", tags=["WMS"])
async def get_wms_feature_info(payload: WmsFeatureInfoRequest):
    try:
        layer_type = (payload.layerType or "").lower()

        if layer_type == "car":
            base_urls = [
                "http://localhost:8080/geoserver/imagens_satelite/wms",
                "http://host.docker.internal:8080/geoserver/imagens_satelite/wms",
            ]
            layer_name = "imagens_satelite:PROPRIEDADES_CAR_SP"
        elif layer_type == "mapbiomas":
            base_urls = ["https://production.alerta.mapbiomas.org/geoserver/ows"]
            layer_name = "mapbiomas-alertas:v_alerts_last_status"
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="layerType invalido.")

        bbox_parts = [p.strip() for p in (payload.bbox or "").split(",")]
        if len(bbox_parts) != 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="bbox invalido para GetFeatureInfo. Use minx,miny,maxx,maxy."
            )

        minx, miny, maxx, maxy = [float(p) for p in bbox_parts]
        bbox_lonlat = f"{minx},{miny},{maxx},{maxy}"
        bbox_latlon = f"{miny},{minx},{maxy},{maxx}"

        request_attempts = [
            {
                "service": "WMS",
                "version": "1.1.1",
                "request": "GetFeatureInfo",
                "layers": layer_name,
                "query_layers": layer_name,
                "bbox": bbox_lonlat,
                "feature_count": 10,
                "height": payload.height,
                "width": payload.width,
                "info_format": "application/json",
                "srs": "EPSG:4326",
                "x": payload.x,
                "y": payload.y,
            },
            {
                "service": "WMS",
                "version": "1.3.0",
                "request": "GetFeatureInfo",
                "layers": layer_name,
                "query_layers": layer_name,
                "bbox": bbox_lonlat,
                "feature_count": 10,
                "height": payload.height,
                "width": payload.width,
                "info_format": "application/json",
                "crs": "CRS:84",
                "i": payload.x,
                "j": payload.y,
            },
            {
                "service": "WMS",
                "version": "1.3.0",
                "request": "GetFeatureInfo",
                "layers": layer_name,
                "query_layers": layer_name,
                "bbox": bbox_latlon,
                "feature_count": 10,
                "height": payload.height,
                "width": payload.width,
                "info_format": "application/json",
                "crs": "EPSG:4326",
                "i": payload.x,
                "j": payload.y,
            },
        ]

        last_error = None
        last_text = None
        request_timeout_seconds = 10 if layer_type == "mapbiomas" else 25

        for base_url in base_urls:
            for params in request_attempts:
                try:
                    response = requests.get(base_url, params=params, timeout=request_timeout_seconds)
                    if not response.ok:
                        last_error = f"{response.status_code} em {base_url}"
                        last_text = (response.text or "")[:400]
                        continue

                    try:
                        parsed = response.json()
                    except ValueError:
                        parsed = None

                    if isinstance(parsed, dict):
                        features = parsed.get("features", [])
                        if isinstance(features, list):
                            return parsed

                    content = (response.text or "").lower()
                    if "serviceexception" in content and ("no features" in content or "empty" in content):
                        return {"type": "FeatureCollection", "features": []}

                    if layer_type == "mapbiomas":
                        return {"type": "FeatureCollection", "features": []}

                    last_error = "Resposta WMS sem JSON valido."
                    last_text = (response.text or "")[:400]
                except requests.Timeout as req_err:
                    if layer_type == "mapbiomas":
                        return {
                            "type": "FeatureCollection",
                            "features": [],
                            "warning": f"Timeout ao consultar MapBiomas: {req_err}",
                        }
                    last_error = req_err
                    continue
                except requests.RequestException as req_err:
                    last_error = req_err
                    continue

        if last_error is not None:
            # O serviço externo do MapBiomas pode oscilar/estourar timeout.
            # Nesse caso, retornamos vazio para não quebrar o fluxo do mapa.
            if layer_type == "mapbiomas":
                return {
                    "type": "FeatureCollection",
                    "features": [],
                    "warning": f"Servico MapBiomas indisponivel no momento: {last_error}",
                }
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Falha ao consultar servico WMS: {last_error}. {last_text or ''}".strip()
            )

        return {"type": "FeatureCollection", "features": []}

    except HTTPException as he:
        raise he
    except requests.RequestException as re:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao consultar servico WMS: {re}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao consultar WMS: {e}"
        )

@app.get("/api/wfs/car-features", tags=["WFS"])
async def get_car_features_by_bbox(
    bbox: str,
    start_index: int = 0,
    count: int = 1500
):
    """
    Retorna feiÃ§Ãµes CAR em GeoJSON para um bbox no formato:
    minx,miny,maxx,maxy (EPSG:4326)
    """
    try:
        parts = [p.strip() for p in bbox.split(",")]
        if len(parts) != 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ParÃ¢metro bbox invÃ¡lido. Use minx,miny,maxx,maxy."
            )

        minx, miny, maxx, maxy = [float(p) for p in parts]
        if minx >= maxx or miny >= maxy:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="bbox invalido: min deve ser menor que max."
            )
        # ForÃ§a ordem lon/lat no bbox.
        bbox_with_crs = f"{minx},{miny},{maxx},{maxy},CRS:84"

        base_urls = [
            "http://localhost:8080/geoserver/imagens_satelite/ows",
            "http://host.docker.internal:8080/geoserver/imagens_satelite/ows",
        ]

        page_size = max(100, min(count, 3000))
        start_index = max(0, start_index)

        def fetch_page(base_url: str, start_index: int):
            params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": "imagens_satelite:PROPRIEDADES_CAR_SP",
                "outputFormat": "application/json",
                "srsName": "CRS:84",
                "bbox": bbox_with_crs,
                "count": page_size,
                "startIndex": start_index,
                "sortBy": "cod_imovel A",
            }
            last_error = None
            for _attempt in range(3):
                try:
                    response = requests.get(base_url, params=params, timeout=20)
                    response.raise_for_status()
                    return response.json()
                except requests.RequestException as req_err:
                    last_error = req_err
                    continue
            raise last_error

        last_error = None
        selected_base_url = None

        for base_url in base_urls:
            try:
                _ = fetch_page(base_url, 0)
                selected_base_url = base_url
                break
            except (requests.RequestException, ValueError) as req_err:
                last_error = req_err
                continue

        if selected_base_url is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Falha ao consultar serviÃ§o WFS CAR: {last_error}"
            )

        try:
            payload = fetch_page(selected_base_url, start_index)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="O serviÃ§o WFS CAR nÃ£o retornou JSON vÃ¡lido."
            )

        page_features = payload.get("features", []) or []
        raw_total = payload.get("totalFeatures")
        try:
            total_features = int(raw_total) if raw_total is not None else None
        except (TypeError, ValueError):
            total_features = None

        returned_features = len(page_features)
        next_start_index = None
        if returned_features == page_size:
            if total_features is None or (start_index + returned_features) < total_features:
                next_start_index = start_index + returned_features

        return {
            "type": "FeatureCollection",
            "features": page_features,
            "totalFeatures": total_features if total_features is not None else returned_features,
            "returnedFeatures": returned_features,
            "startIndex": start_index,
            "nextStartIndex": next_start_index,
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao consultar WFS CAR: {e}"
        )


@app.post("/api/agronomo/relatorio", response_model=AgronomoRelatorioResponse, tags=["Agronomo"])
async def gerar_relatorio_agronomo(payload: AgronomoRelatorioRequest):
    try:
        report = await asyncio.to_thread(_call_openai_agronomo, payload)
        now = datetime.utcnow()
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                insert_stmt = agronomo_relatorios.insert().values(
                    talhao=payload.talhao,
                    area_ha=payload.area_ha,
                    indice=payload.indice,
                    periodo_inicio=payload.periodo.inicio,
                    periodo_fim=payload.periodo.fim,
                    payload_json=json.dumps(payload.model_dump(), ensure_ascii=False),
                    resposta_json=json.dumps(report, ensure_ascii=False),
                    nivel_atencao=report.get("nivel_atencao", "medio"),
                    created_at=now,
                )
                result = connection.execute(insert_stmt)
                new_id = int(result.inserted_primary_key[0])
                transaction.commit()
            except Exception:
                transaction.rollback()
                raise

        return AgronomoRelatorioResponse(
            id=new_id,
            timestamp=now.isoformat() + "Z",
            resumo=str(report.get("resumo", "")),
            diagnostico=str(report.get("diagnostico", "")),
            causas=str(report.get("causas", "")),
            recomendacoes=str(report.get("recomendacoes", "")),
            nivel_atencao=str(report.get("nivel_atencao", "medio")),
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao gerar relatorio do agronomo: {e}",
        )


@app.get("/api/agronomo/relatorios", tags=["Agronomo"])
async def listar_relatorios_agronomo(talhao: Optional[str] = None, limit: int = 20):
    try:
        safe_limit = max(1, min(limit, 100))
        with engine.connect() as connection:
            base_query = (
                "SELECT id, talhao, area_ha, indice, periodo_inicio, periodo_fim, "
                "nivel_atencao, created_at, resposta_json "
                "FROM agronomo_relatorios "
            )
            params: Dict[str, Any] = {"limit": safe_limit}
            if talhao and talhao.strip():
                base_query += "WHERE talhao = :talhao "
                params["talhao"] = talhao.strip()
            base_query += "ORDER BY created_at DESC LIMIT :limit"
            rows = connection.execute(text(base_query), params).fetchall()

        items = []
        for row in rows:
            report = {}
            try:
                report = json.loads(row.resposta_json or "{}")
            except Exception:
                report = {}
            items.append(
                {
                    "id": int(row.id),
                    "talhao": row.talhao,
                    "area_ha": float(row.area_ha),
                    "indice": row.indice,
                    "periodo": {"inicio": row.periodo_inicio, "fim": row.periodo_fim},
                    "nivel_atencao": row.nivel_atencao,
                    "timestamp": row.created_at.isoformat() + "Z" if row.created_at else None,
                    "resumo": report.get("resumo", ""),
                }
            )
        return {"items": items}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao listar relatorios: {e}",
        )


@app.get("/api/agronomo/relatorio/{report_id}/comparar-anterior", tags=["Agronomo"])
async def comparar_relatorio_anterior(report_id: int):
    try:
        with engine.connect() as connection:
            current = connection.execute(
                text(
                    "SELECT id, talhao, indice, nivel_atencao, created_at, resposta_json "
                    "FROM agronomo_relatorios WHERE id = :id"
                ),
                {"id": report_id},
            ).fetchone()
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relatorio nao encontrado.")

            previous = connection.execute(
                text(
                    "SELECT id, nivel_atencao, created_at, resposta_json "
                    "FROM agronomo_relatorios "
                    "WHERE talhao = :talhao AND indice = :indice AND id < :id "
                    "ORDER BY id DESC LIMIT 1"
                ),
                {"talhao": current.talhao, "indice": current.indice, "id": report_id},
            ).fetchone()

        current_json = json.loads(current.resposta_json or "{}")
        previous_json = json.loads(previous.resposta_json or "{}") if previous else None
        return {
            "atual": {
                "id": int(current.id),
                "nivel_atencao": current.nivel_atencao,
                "timestamp": current.created_at.isoformat() + "Z" if current.created_at else None,
                "resumo": current_json.get("resumo", ""),
            },
            "anterior": (
                {
                    "id": int(previous.id),
                    "nivel_atencao": previous.nivel_atencao,
                    "timestamp": previous.created_at.isoformat() + "Z" if previous.created_at else None,
                    "resumo": previous_json.get("resumo", "") if previous_json else "",
                }
                if previous
                else None
            ),
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno na comparacao de relatorios: {e}",
        )

@app.post("/api/properties", status_code=status.HTTP_201_CREATED, response_model=PropertyDetails, tags=["Properties"])
async def create_property(property_data: PropertyCreate):
    try:
        geom_shape_3d = shape(property_data.geometry)
        geom_shape_2d = remove_z_dimension(geom_shape_3d)
        
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
            geom=f'SRID=4326;{geom_shape_2d.wkt}',
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
        print("âš ï¸  CriaÃ§Ã£o de propriedade cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o de criaÃ§Ã£o de propriedade foi cancelada.")
    except Exception as e:
        print(f"âŒ Erro ao salvar propriedade: {e}")
        if "UniqueViolation" in str(e) or "duplicate key value" in str(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="JÃ¡ existe uma propriedade cadastrada com este CPF/CNPJ.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao salvar a propriedade: {e}")

@app.put("/api/properties/{property_id}", response_model=PropertyDetails, tags=["Properties"])
async def update_property(property_id: int, property_update_data: PropertyCreate):
    try:
        existing_property_query = select(propriedades_rurais.c.id).where(propriedades_rurais.c.id == property_id)
        with engine.connect() as connection:
            existing_id = connection.execute(existing_property_query).scalar_one_or_none()
            if existing_id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propriedade nÃ£o encontrada.")

        geom_shape_3d = shape(property_update_data.geometry)
        geom_shape_2d = remove_z_dimension(geom_shape_3d)
        
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
            "geom": f'SRID=4326;{geom_shape_2d.wkt}'
        }

        update_query = propriedades_rurais.update().where(propriedades_rurais.c.id == property_id).values(**update_values)

        with engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(update_query)
            transaction.commit()
            
            return await get_property_by_id(property_id)

    except asyncio.CancelledError:
        print(f"âš ï¸  AtualizaÃ§Ã£o de propriedade (ID: {property_id}) cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o de atualizaÃ§Ã£o foi cancelada.")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"âŒ Erro ao atualizar propriedade (ID: {property_id}): {e}")
        if "UniqueViolation" in str(e) or "duplicate key value" in str(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="JÃ¡ existe outra propriedade cadastrada com este CPF/CNPJ.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao atualizar a propriedade: {e}")

@app.delete("/api/properties/{property_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Properties"])
async def delete_property(property_id: int):
    try:
        check_query = select(propriedades_rurais.c.id).where(propriedades_rurais.c.id == property_id)
        with engine.connect() as connection:
            existing_id = connection.execute(check_query).scalar_one_or_none()
            if existing_id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propriedade nÃ£o encontrada.")

        delete_query = propriedades_rurais.delete().where(propriedades_rurais.c.id == property_id)
        with engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(delete_query)
            transaction.commit()
        return

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"âŒ Erro ao excluir propriedade (ID: {property_id}): {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao excluir a propriedade: {e}")

@app.get("/api/properties", response_model=FeatureCollection, tags=["Properties"])
async def get_all_properties():
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
        print("âš ï¸  Busca de todas as propriedades cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"âŒ Erro ao buscar propriedades: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao buscar propriedades.")

@app.post("/api/properties/{property_id}/talhoes", status_code=status.HTTP_201_CREATED, response_model=TalhaoDetails, tags=["TalhÃµes"])
async def create_talhao_for_property(property_id: int, talhao_data: TalhaoCreate):
    try:
        check_property_query = select(propriedades_rurais.c.id).where(propriedades_rurais.c.id == property_id)
        with engine.connect() as connection:
            existing_id = connection.execute(check_property_query).scalar_one_or_none()
            if existing_id is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail=f"A propriedade com ID {property_id} nÃ£o foi encontrada."
                )

        geom_shape_3d = shape(talhao_data.geometry)
        geom_shape_2d = remove_z_dimension(geom_shape_3d)
        
        insert_query = talhoes.insert().values(
            propriedade_id=property_id,
            nome=talhao_data.nome,
            area=talhao_data.area,
            cultura_principal=talhao_data.cultura_principal,
            geometry=f'SRID=4326;{geom_shape_2d.wkt}'
        ).returning(talhoes)

        with engine.connect() as connection:
            transaction = connection.begin()
            result = connection.execute(insert_query).mappings().first()
            transaction.commit()
            
            if not result:
                 raise HTTPException(status_code=500, detail="Falha ao obter os dados do talhÃ£o apÃ³s a inserÃ§Ã£o.")
            
            talhao_salvo = dict(result)
            geom_query = select(ST_AsGeoJSON(talhoes.c.geometry).label('geometry_geojson')).where(talhoes.c.id == talhao_salvo['id'])
            with engine.connect() as conn_geom:
                 geom_geojson_str = conn_geom.execute(geom_query).scalar_one()
                 talhao_salvo['geometry'] = json.loads(geom_geojson_str)

            return TalhaoDetails(**talhao_salvo)

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"âŒ Erro ao salvar o talhÃ£o: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Ocorreu um erro interno ao salvar o talhÃ£o: {e}"
        )
    
@app.get("/api/properties/{property_id}", response_model=PropertyDetails, tags=["Properties"])
async def get_property_by_id(property_id: int):
    query = select(
        propriedades_rurais,
        ST_AsGeoJSON(propriedades_rurais.c.geom).label('geometry_geojson')
    ).where(propriedades_rurais.c.id == property_id)
    try:
        with engine.connect() as connection:
            result = connection.execute(query).mappings().first()
            if result is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Propriedade nÃ£o encontrada.")
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
        print(f"âš ï¸  Busca de propriedade por ID ({property_id}) cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"âŒ Erro ao buscar propriedade: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro interno ao buscar propriedade.")

# --------------------------------------------------------------------------
# ENDPOINTS PARA RESERVATÃ“RIOS
# --------------------------------------------------------------------------

@app.post("/api/reservoirs", status_code=status.HTTP_201_CREATED, response_model=ReservoirDetails, tags=["Reservoirs"])
async def create_reservoir(reservoir_data: ReservoirCreate):
    try:
        geometry_data = reservoir_data.geometry
        geom_shape_3d = None

        if geometry_data and geometry_data.get('type') == 'GeometryCollection':
            polygon_geom = None
            for geom in geometry_data.get('geometries', []):
                if geom and geom.get('type') in ['Polygon', 'MultiPolygon']:
                    polygon_geom = geom
                    break 
            
            if not polygon_geom:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="O arquivo KML contÃ©m uma coleÃ§Ã£o de geometrias, mas nenhuma delas Ã© um polÃ­gono vÃ¡lido."
                )
            geom_shape_3d = shape(polygon_geom)
        else:
            geom_shape_3d = shape(geometry_data)

        geom_shape_2d = remove_z_dimension(geom_shape_3d)

        insert_query = reservoirs_table.insert().values(
            name=reservoir_data.name,
            description=reservoir_data.description,
            geom=f'SRID=4326;{geom_shape_2d.wkt}'
        ).returning(reservoirs_table)

        with engine.connect() as connection:
            transaction = connection.begin()
            result = connection.execute(insert_query).mappings().first()
            transaction.commit()

            if not result:
                raise HTTPException(status_code=500, detail="Falha ao obter os dados do reservatÃ³rio apÃ³s a inserÃ§Ã£o.")
            
            new_reservoir = dict(result)
            geom_query = select(ST_AsGeoJSON(reservoirs_table.c.geom).label('geometry_geojson')).where(reservoirs_table.c.id == new_reservoir['id'])
            
            with engine.connect() as conn_geom:
                 geom_geojson_str = conn_geom.execute(geom_query).scalar_one()
                 new_reservoir['geometry'] = json.loads(geom_geojson_str)
            
            return ReservoirDetails(**new_reservoir)

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"âŒ Erro ao salvar o reservatÃ³rio: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro interno ao salvar o reservatÃ³rio: {e}")


@app.get("/api/reservoirs", tags=["Reservoirs"])
async def get_all_reservoirs():
    query = select(
        reservoirs_table.c.id,
        reservoirs_table.c.name,
        reservoirs_table.c.description,
        ST_AsGeoJSON(reservoirs_table.c.geom).label('geometry')
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
                        "name": row['name'],
                        "description": row['description']
                    }
                })
        return {"type": "FeatureCollection", "features": features}
    except Exception as e:
        print(f"âŒ Erro ao buscar reservatÃ³rios: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar reservatÃ³rios.")


@app.delete("/api/reservoirs/{reservoir_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Reservoirs"])
async def delete_reservoir(reservoir_id: int):
    try:
        check_query = select(reservoirs_table.c.id).where(reservoirs_table.c.id == reservoir_id)
        with engine.connect() as connection:
            existing_id = connection.execute(check_query).scalar_one_or_none()
            if existing_id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ReservatÃ³rio nÃ£o encontrado.")

        delete_query = reservoirs_table.delete().where(reservoirs_table.c.id == reservoir_id)
        with engine.connect() as connection:
            transaction = connection.begin()
            connection.execute(delete_query)
            transaction.commit()
        return

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"âŒ Erro ao excluir reservatÃ³rio (ID: {reservoir_id}): {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao excluir o reservatÃ³rio: {e}")


# === ENDPOINTS DO GOOGLE EARTH ENGINE ===
@app.post("/api/earth-images/search", response_model=List[ImageInfo], tags=["Google Earth Engine"])
async def search_earth_images(request: SearchRequest):
    try:
        geometry = create_ee_geometry_from_json(request.polygon)
        collection_name = SATELLITE_COLLECTIONS.get(request.satellite)
        if not collection_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SatÃ©lite invÃ¡lido.")
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
            
            # Miniaturas maiores e sem compressao com perdas para reduzir pixelizacao no carrossel.
            thumbnail_url = await asyncio.to_thread(scaled_image.visualize(**vis_params_rgb).getThumbURL, {
                'dimensions': 640,
                'region': geometry.bounds(),
                'format': 'png'
            })
            results.append(ImageInfo(
                id=image_id,
                date=dt.strftime('%d/%m/%Y'),
                thumbnailUrl=thumbnail_url
            ))
        return results
    except asyncio.CancelledError:
        print(f"âš ï¸  RequisiÃ§Ã£o para {request.satellite} (busca de imagens) foi cancelada pelo cliente ou timeout.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        print(f"âŒ Erro inesperado na busca de imagens: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/preview", tags=["Google Earth Engine"])
async def get_image_preview_layer(request: ImagePreviewRequest):
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
        print("âš ï¸  GeraÃ§Ã£o de preview cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"âŒ Erro ao gerar preview: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Erro ao gerar preview: {e}")

@app.post("/api/earth-images/indices", response_model=IndicesResponse, tags=["Google Earth Engine"])
async def generate_indices(request: IndicesRequest):
    try:
        if not request.indices:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A lista de Ã­ndices nÃ£o pode ser vazia.")
        
        is_landsat = "LANDSAT" in request.satellite
        if 'Red-Edge NDVI' in request.indices and is_landsat:
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Red-Edge NDVI sÃ³ pode ser calculado para satÃ©lites Sentinel-2.")

        geometry = create_ee_geometry_from_json(request.polygon)
        image = ee.Image(request.imageId)
        calculated_indices = calculate_indices_gee(image, is_landsat, request.indices)
        
        results = []
        vis_params_index = {'min': 0, 'max': 1, 'palette': ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641']}
        
        for index_name, index_image in calculated_indices.items():
            clipped_index_image = index_image.clip(geometry)
            classification_data = None
            
            scale = 10 if "SENTINEL" in request.satellite.upper() else 30
            pixel_area = scale * scale
            sensor_str = "Sentinel" if "SENTINEL" in request.satellite.upper() else "Landsat"

            if index_name.upper() == "NDVI":
                classification_data = await classify_and_quantify_ndvi_all(image, clipped_index_image, geometry, pixel_area, scale, is_landsat)
                classification_data.update({"pixel_area_m2": pixel_area, "scale_m": scale, "sensor": sensor_str})
            
            elif index_name.upper() == "SAVI":
                classification_data = await classify_and_quantify_savi(clipped_index_image, geometry, pixel_area, scale)
                classification_data.update({"sensor": sensor_str, "scale": scale})

            elif index_name.upper() == "MSAVI":
                classification_data = await classify_and_quantify_msavi(clipped_index_image, geometry, pixel_area, scale)
                classification_data.update({"sensor": sensor_str, "scale": scale})

            elif index_name.upper() == "RED-EDGE NDVI":
                classification_data = await classify_and_quantify_ndre(clipped_index_image, geometry, pixel_area, scale)
                classification_data.update({"sensor": sensor_str, "scale": scale})

            map_id_task = asyncio.to_thread(clipped_index_image.getMapId, vis_params_index)
            download_url_task = asyncio.to_thread(clipped_index_image.getDownloadURL, {'scale': 30, 'crs': 'EPSG:4326', 'region': geometry.bounds(), 'format': 'GEO_TIFF'})
            
            map_id, download_url = await asyncio.gather(map_id_task, download_url_task)

            results.append(IndexResult(
                indexName=index_name,
                imageUrl=map_id['tile_fetcher'].url_format,
                downloadUrl=download_url,
                classification=classification_data
            ))
        
        bounds_info = await asyncio.to_thread(geometry.bounds().getInfo)
        
        bounds_for_response = []
        if bounds_info and 'coordinates' in bounds_info and bounds_info['coordinates']:
            bounds_coords = bounds_info['coordinates'][0] 
            bounds_for_response = [[coord[1], coord[0]] for coord in bounds_coords]
        else:
            bounds_for_response = [[-90.0, -180.0], [90.0, 180.0]]

        return IndicesResponse(bounds=bounds_for_response, results=results)

    except asyncio.CancelledError:
        print("âš ï¸  GeraÃ§Ã£o de Ã­ndices cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        print(f"âŒ Erro inesperado ao gerar Ã­ndices: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno: {e}")

@app.post("/api/earth-images/change-detection", response_model=ChangeDetectionResponse, tags=["Google Earth Engine"])
async def detect_changes(request: ChangeDetectionRequest):
    try:
        before_image = ee.Image(request.beforeImageId)
        after_image = ee.Image(request.afterImageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        is_landsat = "LANDSAT" in request.satellite

        before_ndvi = calculate_indices_gee(before_image, is_landsat, ['NDVI'])['NDVI']
        after_ndvi = calculate_indices_gee(after_image, is_landsat, ['NDVI'])['NDVI']

        VEGETATION_THRESHOLD = 0.3
        vegetation_mask = before_ndvi.gte(VEGETATION_THRESHOLD)
        before_ndvi = before_ndvi.updateMask(vegetation_mask)
        after_ndvi = after_ndvi.updateMask(vegetation_mask)
        ndvi_difference = after_ndvi.subtract(before_ndvi)
        threshold = request.threshold or 0.25
        
        gain_mask = ndvi_difference.gt(threshold)
        loss_mask = ndvi_difference.lt(-threshold)
        
        change_map = ee.Image(0).where(gain_mask, 2).where(loss_mask, 1).selfMask()

        kernel = ee.Kernel.square(radius=1, units='pixels')
        cleaned_map = change_map.focal_min(kernel=kernel, iterations=1) \
                                .focal_max(kernel=kernel, iterations=1)

        change_vectors = cleaned_map.reduceToVectors(
            geometry=geometry, scale=30, geometryType='polygon',
            eightConnected=False, labelProperty='change_type', maxPixels=1e10
        )

        SMOOTHING_RADIUS = 20
        ERROR_TOLERANCE = 20

        def smooth_and_clip_feature(feature):
            smoothed_geometry = feature.geometry() \
                                   .buffer(SMOOTHING_RADIUS, maxError=1) \
                                   .buffer(-SMOOTHING_RADIUS, maxError=1) \
                                   .simplify(maxError=ERROR_TOLERANCE)
            
            clipped_geometry = smoothed_geometry.intersection(geometry, maxError=1)
            
            return feature.setGeometry(clipped_geometry)

        final_vectors = change_vectors.map(smooth_and_clip_feature)
        
        gain_polygons = final_vectors.filter(ee.Filter.eq('change_type', 2))
        loss_polygons = final_vectors.filter(ee.Filter.eq('change_type', 1))

        gain_area_value_task = asyncio.to_thread(gain_polygons.geometry().area(maxError=1).divide(10000).getInfo)
        loss_area_value_task = asyncio.to_thread(loss_polygons.geometry().area(maxError=1).divide(10000).getInfo)
        total_area_value_task = asyncio.to_thread(geometry.area(maxError=1).divide(10000).getInfo)
        
        gain_area_value, loss_area_value, total_area_value = await asyncio.gather(
            gain_area_value_task, loss_area_value_task, total_area_value_task
        )
        
        gain_area_value = gain_area_value or 0.0
        loss_area_value = loss_area_value or 0.0
        total_area_value = total_area_value or 0.0

        change_geojson = await asyncio.to_thread(final_vectors.getInfo)

        # Suaviza levemente o raster de diferenca para reduzir aspecto "quadriculado" na visualizacao.
        smoothing_kernel = ee.Kernel.gaussian(radius=1.2, sigma=0.9, units='pixels', normalize=True)
        ndvi_difference_soft = (
            ndvi_difference
            .convolve(smoothing_kernel)
            .resample('bicubic')
            .clip(geometry)
        )

        diff_vis_params = {'min': -0.5, 'max': 0.5, 'palette': ['#b71c1c', '#ef9a9a', '#ffffff', '#a5d6a7', '#1b5e20']}
        diff_map_id = await asyncio.to_thread(ndvi_difference_soft.getMapId, diff_vis_params)
        diff_url = diff_map_id['tile_fetcher'].url_format

        return ChangeDetectionResponse(
            changeGeoJson=change_geojson, 
            differenceImageUrl=diff_url,
            gainAreaHa=gain_area_value,
            lossAreaHa=loss_area_value,
            totalAreaHa=total_area_value
        )
    except asyncio.CancelledError:
        print("âš ï¸  DetecÃ§Ã£o de mudanÃ§as cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"âŒ Erro ao detectar mudanÃ§as: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao detectar mudanÃ§as: {e}")

    
@app.post("/api/earth-images/download-info", response_model=DownloadInfoResponse, tags=["Google Earth Engine"])
async def get_download_info(request: DownloadInfoRequest):
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
        print("âš ï¸  GeraÃ§Ã£o de URL de download cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"âŒ Erro ao gerar URL de download: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno ao obter informaÃ§Ãµes para download: {e}")

@app.get("/api/earth-images/precipitation-tiles", tags=["Google Earth Engine"])
async def get_precipitation_tile():
    try:
        today = ee.Date(date.today())
        start_of_month = today.update(day=1)
        end_of_month = start_of_month.advance(1, 'month')
        image = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(start_of_month, end_of_month).mean()
        vis_params = {'min': 0, 'max': 50, 'palette': ['white', 'blue', 'purple']}
        map_id_dict = await asyncio.to_thread(image.visualize(**vis_params).getMapId)
        return {"tileUrl": map_id_dict['tile_fetcher'].url_format}
    except asyncio.CancelledError:
        print("âš ï¸  GeraÃ§Ã£o de camada de precipitaÃ§Ã£o cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except Exception as e:
        print(f"âŒ Erro ao gerar camada de precipitaÃ§Ã£o: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))   

