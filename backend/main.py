import os
import ee
import logging
import requests
from fastapi import FastAPI, HTTPException, status, File, UploadFile, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import date, datetime, timedelta
import json
import asyncio
import csv
import io
import threading
from contextlib import asynccontextmanager
import httpx
from urllib.parse import quote, urlparse
import sys
from dotenv import load_dotenv

load_dotenv()

try:
    # Evita UnicodeEncodeError em consoles Windows com encoding legado (cp1252).
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass

try:
    from routers.landcover import router as landcover_router
except ModuleNotFoundError:
    from backend.routers.landcover import router as landcover_router

try:
    from routers.terrain_profile import router as terrain_profile_router
except ModuleNotFoundError:
    from backend.routers.terrain_profile import router as terrain_profile_router

try:
    from routers.field_dispatch import router as field_dispatch_router
    from routers.field_dispatch import field_forms_router
except ModuleNotFoundError:
    from backend.routers.field_dispatch import router as field_dispatch_router
    from backend.routers.field_dispatch import field_forms_router

try:
    from services.landcover_service import refine_landcover
except ModuleNotFoundError:
    from backend.services.landcover_service import refine_landcover

# --------------------------------------------------------------------------
# IMPORTAÃ‡Ã•ES PARA BANCO DE DADOS
# --------------------------------------------------------------------------
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, Float, DateTime, Text, text, select, func
from sqlalchemy.engine import URL
from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_AsGeoJSON
from shapely.geometry import mapping, shape
from shapely.ops import transform


# --------------------------------------------------------------------------
# INICIALIZAÃ‡ÃƒO E CONFIGURAÃ‡ÃƒO
# --------------------------------------------------------------------------

logger = logging.getLogger("webgis.reservoir_monitoring")

# FunÃ§Ã£o para remover a dimensÃ£o Z (altitude) de uma geometria
def remove_z_dimension(geom):
    if geom.has_z:
        return transform(lambda x, y, z=None: (x, y), geom)
    return geom

EARTH_ENGINE_READY = False


def _run_with_timeout(callback, timeout_seconds: int) -> tuple[bool, Optional[Exception]]:
    outcome: Dict[str, Optional[Exception] | bool] = {"done": False, "error": None}

    def _target() -> None:
        try:
            callback()
            outcome["done"] = True
        except Exception as inner_error:  # pragma: no cover - defensive path
            outcome["error"] = inner_error

    worker = threading.Thread(target=_target, daemon=True)
    worker.start()
    worker.join(max(1, timeout_seconds))
    if worker.is_alive():
        return False, TimeoutError(f"timed out after {timeout_seconds}s")
    error = outcome["error"]
    if isinstance(error, Exception):
        return False, error
    return bool(outcome["done"]), None


def init_earth_engine() -> bool:
    """Inicializa o Google Earth Engine sem interromper o bootstrap da API."""
    init_timeout = int(os.getenv("EE_INIT_TIMEOUT_SECONDS", "8"))
    ok, ambient_error = _run_with_timeout(
        lambda: ee.Initialize(project="charged-polymer-442201-t5"),
        init_timeout,
    )
    if ok:
        logger.info("Earth Engine initialized with ambient credentials.")
        return True

    logger.warning(
        "Earth Engine ambient credentials unavailable (%s). Trying service account file.",
        ambient_error,
    )

    cred_path = os.getenv(
        "EE_CREDENTIALS_PATH",
        r"C:\\RKSISTEMAS\\DEV\\MVP\\webgis-mvp\\backend\\credentials\\credentials.json",
    )
    service_account = "gee-service@charged-polymer-442201-t5.iam.gserviceaccount.com"
    if not os.path.isfile(cred_path):
        logger.error("Earth Engine credentials file not found: %s", cred_path)
        return False

    try:
        credentials = ee.ServiceAccountCredentials(service_account, cred_path)
    except Exception as credential_error:
        logger.error("Earth Engine service-account credentials are invalid: %s", credential_error)
        return False

    ok, service_error = _run_with_timeout(
        lambda: ee.Initialize(credentials, project="charged-polymer-442201-t5"),
        init_timeout,
    )
    if ok:
        logger.info("Earth Engine initialized with service account file.")
        return True

    logger.error("Earth Engine initialization failed via service account: %s", service_error)
    return False


EARTH_ENGINE_READY = init_earth_engine()

# --------------------------------------------------------------------------
# CONFIGURAÃ‡ÃƒO DO BANCO DE DADOS POSTGRESQL
# --------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required. Configure it in .env.")

if str(DATABASE_URL).startswith("postgresql"):
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=8,
        connect_args={
            "connect_timeout": 5,
            "options": "-c statement_timeout=12000 -c lock_timeout=6000",
        },
    )
else:
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

# --------------------------------------------------------------------------
# TABELAS DO MODULO DE MONITORAMENTO DE RESERVATORIOS
# --------------------------------------------------------------------------
reservatorio_contexto_table = Table(
    "reservatorio_contexto",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False, unique=True),
    Column("reservatorio_codigo", String(80), nullable=True),
    Column("reservatorio_tipo", String(120), nullable=True),
    Column("orgao_responsavel", String(255), nullable=True),
    Column("municipio", String(120), nullable=True),
    Column("estado", String(120), nullable=True),
    Column("status_monitoramento", String(40), nullable=False, default="active"),
    Column("parametros_json", Text, nullable=False, default="{}"),
    Column("metadados_json", Text, nullable=False, default="{}"),
    Column("geom_monitoramento", Geometry("GEOMETRY", srid=4326, dimension=2), nullable=True),
    Column("geom_entorno", Geometry("GEOMETRY", srid=4326, dimension=2), nullable=True),
    Column("geom_app", Geometry("GEOMETRY", srid=4326, dimension=2), nullable=True),
    Column("geom_bacia_imediata", Geometry("GEOMETRY", srid=4326, dimension=2), nullable=True),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("updated_at", DateTime, nullable=False, default=datetime.utcnow),
)

reservatorio_area_monitoramento_table = Table(
    "reservatorio_area_monitoramento",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("nome_area", String(255), nullable=False),
    Column("tipo_area", String(80), nullable=False),
    Column("geom", Geometry("GEOMETRY", srid=4326, dimension=2), nullable=False),
    Column("area_ha", Float, nullable=True),
    Column("perimetro_km", Float, nullable=True),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

reservatorio_app_table = Table(
    "reservatorio_app",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("nome", String(255), nullable=False, default="APP"),
    Column("limiar_degradacao", Float, nullable=False, default=0.15),
    Column("geom", Geometry("GEOMETRY", srid=4326, dimension=2), nullable=False),
    Column("area_ha", Float, nullable=True),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

analise_reservatorio_table = Table(
    "analise_reservatorio",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("tipo_analise", String(80), nullable=False),
    Column("periodo_inicio", DateTime, nullable=True),
    Column("periodo_fim", DateTime, nullable=True),
    Column("status", String(40), nullable=False, default="completed"),
    Column("origem_dados", String(80), nullable=False, default="gee"),
    Column("duracao_ms", Float, nullable=True),
    Column("parametros_json", Text, nullable=False, default="{}"),
    Column("resultado_json", Text, nullable=False, default="{}"),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

imagem_reservatorio_table = Table(
    "imagem_reservatorio",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("image_id", String(255), nullable=False),
    Column("satellite", String(80), nullable=False),
    Column("acquired_at", DateTime, nullable=True),
    Column("cloud_pct", Float, nullable=True),
    Column("thumbnail_url", Text, nullable=True),
    Column("metadados_json", Text, nullable=False, default="{}"),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

resultado_indice_table = Table(
    "resultado_indice",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("analysis_id", Integer, nullable=True),
    Column("image_id", String(255), nullable=False),
    Column("indice_nome", String(80), nullable=False),
    Column("valor_min", Float, nullable=True),
    Column("valor_max", Float, nullable=True),
    Column("valor_medio", Float, nullable=True),
    Column("tile_url", Text, nullable=True),
    Column("download_url", Text, nullable=True),
    Column("estatisticas_json", Text, nullable=False, default="{}"),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

serie_temporal_indicador_table = Table(
    "serie_temporal_indicador",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("indicador_nome", String(120), nullable=False),
    Column("data_referencia", DateTime, nullable=False),
    Column("valor", Float, nullable=False),
    Column("unidade", String(60), nullable=True),
    Column("metadados_json", Text, nullable=False, default="{}"),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

resultado_espelho_agua_table = Table(
    "resultado_espelho_agua",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("analysis_id", Integer, nullable=True),
    Column("image_id", String(255), nullable=False),
    Column("indice_nome", String(80), nullable=False, default="MNDWI"),
    Column("threshold", Float, nullable=False),
    Column("area_ha", Float, nullable=False),
    Column("variacao_percentual", Float, nullable=True),
    Column("geom", Geometry("GEOMETRY", srid=4326, dimension=2), nullable=True),
    Column("metadados_json", Text, nullable=False, default="{}"),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

resultado_classificacao_uso_solo_table = Table(
    "resultado_classificacao_uso_solo",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("analysis_id", Integer, nullable=True),
    Column("classification_id", String(120), nullable=False),
    Column("tile_url", Text, nullable=False),
    Column("estatisticas_json", Text, nullable=False, default="[]"),
    Column("legenda_json", Text, nullable=False, default="[]"),
    Column("periodo_inicio", DateTime, nullable=True),
    Column("periodo_fim", DateTime, nullable=True),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

resultado_deteccao_mudanca_table = Table(
    "resultado_deteccao_mudanca",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("analysis_id", Integer, nullable=True),
    Column("before_image_id", String(255), nullable=False),
    Column("after_image_id", String(255), nullable=False),
    Column("gain_area_ha", Float, nullable=False),
    Column("loss_area_ha", Float, nullable=False),
    Column("total_area_ha", Float, nullable=False),
    Column("change_geojson", Text, nullable=False, default="{}"),
    Column("difference_tile_url", Text, nullable=True),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

alerta_reservatorio_table = Table(
    "alerta_reservatorio",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("analysis_id", Integer, nullable=True),
    Column("tipo_alerta", String(120), nullable=False),
    Column("severidade", String(20), nullable=False),
    Column("mensagem", Text, nullable=False),
    Column("valor_metrica", Float, nullable=True),
    Column("valor_limiar", Float, nullable=True),
    Column("status", String(20), nullable=False, default="active"),
    Column("contexto_json", Text, nullable=False, default="{}"),
    Column("data_alerta", DateTime, nullable=False, default=datetime.utcnow),
)

insight_ia_reservatorio_table = Table(
    "insight_ia_reservatorio",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("reservoir_id", Integer, nullable=False),
    Column("analysis_id", Integer, nullable=True),
    Column("periodo_inicio", DateTime, nullable=True),
    Column("periodo_fim", DateTime, nullable=True),
    Column("prompt_json", Text, nullable=False, default="{}"),
    Column("insight_texto", Text, nullable=False),
    Column("confianca", String(40), nullable=True),
    Column("limitacoes", Text, nullable=True),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

def run_startup_checks():
    """Cria as tabelas no banco de dados ao iniciar a API, se elas nao existirem."""
    startup_timeout = int(os.getenv("DB_STARTUP_TIMEOUT_SECONDS", "10"))

    def _startup_job() -> None:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT extname FROM pg_extension WHERE extname = 'postgis'"))
            if result.scalar_one_or_none() is None:
                logger.warning("PostGIS extension not found. Run CREATE EXTENSION postgis.")
        metadata.create_all(engine)

    ok, startup_error = _run_with_timeout(_startup_job, startup_timeout)
    if ok:
        logger.info("Database tables verified/created successfully.")
        return

    logger.error("Database startup checks failed (non-blocking): %s", startup_error)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_startup_checks()
    yield


app = FastAPI(
    title="WebGIS MVP API",
    description="API para processamento de imagens de satÃ©lite e gerenciamento de propriedades rurais.",
    lifespan=lifespan,
)

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
extra_cors_origins = [
    item.strip()
    for item in str(os.getenv("CORS_ALLOWED_ORIGINS", "")).split(",")
    if item.strip()
]
if extra_cors_origins:
    origins = [*origins, *extra_cors_origins]

# Permite hosts locais em rede (ex.: 192.168.x.x) e links temporarios de tunel publico.
allow_origin_regex = os.getenv(
    "CORS_ALLOW_ORIGIN_REGEX",
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$|^https://[a-zA-Z0-9-]+\.trycloudflare\.com$|^https://[a-zA-Z0-9-]+\.ngrok-free\.dev$|^https://[a-zA-Z0-9-]+\.ngrok\.app$|^https://[a-zA-Z0-9-]+\.ngrok\.io$",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.include_router(landcover_router)
app.include_router(terrain_profile_router)
app.include_router(field_dispatch_router)
app.include_router(field_forms_router)

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
    maxResults: int = Field(default=30, ge=1, le=120)


class Ndvi3DRequest(BaseModel):
    polygon: Optional[Dict[str, Any]] = None
    bbox: Optional[List[float]] = None
    dateFrom: Optional[date] = None
    dateTo: Optional[date] = None
    satellite: str = "SENTINEL_2A"
    cloudPct: float = Field(default=40, ge=0, le=100)
    scale: int = Field(default=30, ge=10, le=120)
    maxFeatures: int = Field(default=2200, ge=100, le=10000)
    simplifyMeters: float = Field(default=20, ge=0, le=500)

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
    downloadUrl: Optional[str] = None
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


class ReservoirMonitoringContextUpsert(BaseModel):
    reservatorio_codigo: Optional[str] = None
    reservatorio_tipo: Optional[str] = None
    orgao_responsavel: Optional[str] = None
    municipio: Optional[str] = None
    estado: Optional[str] = None
    status_monitoramento: str = "active"
    parametros: Dict[str, Any] = Field(default_factory=dict)
    metadados: Dict[str, Any] = Field(default_factory=dict)
    geom_monitoramento: Optional[Dict[str, Any]] = None
    geom_entorno: Optional[Dict[str, Any]] = None
    geom_app: Optional[Dict[str, Any]] = None
    geom_bacia_imediata: Optional[Dict[str, Any]] = None


class ReservoirAreaCreate(BaseModel):
    nome_area: str
    tipo_area: str
    geometry: Dict[str, Any]
    limiar_degradacao: Optional[float] = None


class ReservoirImageSearchRequest(BaseModel):
    dateFrom: date
    dateTo: date
    cloudPct: float = Field(default=30, ge=0, le=100)
    satellite: str
    polygon: Optional[Dict[str, Any]] = None
    maxResults: int = Field(default=30, ge=1, le=120)


class ReservoirIndicesRequest(BaseModel):
    imageId: str
    satellite: str
    indices: List[str]
    polygon: Optional[Dict[str, Any]] = None


class ReservoirWaterbodyRequest(BaseModel):
    imageId: str
    satellite: str
    index_name: str = "MNDWI"
    threshold: float = 0.05
    variation_alert_pct: float = 15.0
    polygon: Optional[Dict[str, Any]] = None


class ReservoirTimeSeriesRequest(BaseModel):
    date_start: date
    date_end: date
    satellite: str
    indicator_name: str = "NDVI"
    metric: str = "index_mean"
    threshold: Optional[float] = None
    max_points: int = Field(default=18, ge=2, le=48)
    polygon: Optional[Dict[str, Any]] = None


class ReservoirLandUseRequest(BaseModel):
    imageId: str
    satellite: str
    soil_exposed_alert_pct: float = 12.0
    anthropic_alert_pct: float = 8.0
    polygon: Optional[Dict[str, Any]] = None


class ReservoirChangeRequest(BaseModel):
    beforeImageId: str
    afterImageId: str
    satellite: str
    threshold: float = 0.25
    loss_alert_ha: float = 6.0
    polygon: Optional[Dict[str, Any]] = None


class ReservoirRiparianRequest(BaseModel):
    imageId: str
    satellite: str
    app_geometry: Optional[Dict[str, Any]] = None
    ndvi_drop_alert_pct: float = 15.0


class ReservoirTurbidityRequest(BaseModel):
    imageId: str
    satellite: str
    threshold: float = 0.12
    polygon: Optional[Dict[str, Any]] = None


class ReservoirAlertStatusUpdate(BaseModel):
    status: str = Field(..., min_length=3, max_length=20)


class ReservoirAiInsightRequest(BaseModel):
    periodo_inicio: Optional[date] = None
    periodo_fim: Optional[date] = None
    limite_analises: int = Field(default=8, ge=1, le=30)


class RefineClass(BaseModel):
    id: int
    name: str
    color: str


class RefineClassificationRequest(BaseModel):
    base_classification_id: Optional[str] = None
    base_classification_asset: Optional[str] = None
    source_aoi: Optional[Dict[str, Any]] = None
    date_start: Optional[date] = None
    date_end: Optional[date] = None
    classes: Optional[List[RefineClass]] = None
    refinement_polygon: Dict[str, Any]
    new_training_samples: Dict[str, Any]


class RefineClassificationResponse(BaseModel):
    classification_id: str
    tile_url: str
    legend: List[Dict[str, Any]]
    class_stats: List[Dict[str, Any]]
    export_url: str

# --------------------------------------------------------------------------
# FUNÃ‡Ã•ES AUXILIARES E CONSTANTES DO GEE
# --------------------------------------------------------------------------

SATELLITE_COLLECTIONS = {
    "LANDSAT_8": "LANDSAT/LC08/C02/T1_L2",
    "LANDSAT_9": "LANDSAT/LC09/C02/T1_L2",
    "SENTINEL_2A": "COPERNICUS/S2_SR_HARMONIZED",
    "SENTINEL_2B": "COPERNICUS/S2_SR_HARMONIZED",
    "CBERS_4A_WFI": "CB4A-WFI-L2-DN-1",
    "CBERS_4A_MUX": "CB4A-MUX-L2-DN-1",
    "CBERS_4_PAN5M": "CB4-PAN5M-L2-DN-1",
    "CBERS_4_PAN10M": "CB4-PAN10M-L2-DN-1",
}

CBERS_STAC_SEARCH_URL = "https://data.inpe.br/bdc/stac/v1/search"
CBERS_STAC_COLLECTION_CANDIDATES = {
    "CBERS_4A_WFI": ["CB4A-WFI-L2-DN-1", "CB4A-WFI-L4-DN-1"],
    "CBERS_4A_MUX": ["CB4A-MUX-L2-DN-1", "CB4A-MUX-L4-DN-1"],
    "CBERS_4_PAN5M": ["CB4-PAN5M-L2-DN-1", "CB4-PAN5M-L4-DN-1"],
    "CBERS_4_PAN10M": ["CB4-PAN10M-L2-DN-1", "CB4-PAN10M-L4-DN-1"],
}


def _log_event(event: str, **payload: Any) -> None:
    safe_payload = {}
    for key, value in payload.items():
        if isinstance(value, (dict, list)):
            safe_payload[key] = value
        elif isinstance(value, (str, int, float, bool)) or value is None:
            safe_payload[key] = value
        else:
            safe_payload[key] = str(value)
    logger.info("[reservoir-monitoring] %s | %s", event, json.dumps(safe_payload, ensure_ascii=True))


def _to_json_text(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=True, default=str)


def _safe_ascii_text(value: Any) -> str:
    return str(value).encode("ascii", "ignore").decode("ascii")


def _from_json_text(value: Optional[str], fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def _safe_parse_ddmmyyyy(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%d/%m/%Y")
    except Exception:
        return None


def _geometry_to_shape(geometry_data: Dict[str, Any]):
    if geometry_data and geometry_data.get("type") == "GeometryCollection":
        for geom in geometry_data.get("geometries", []):
            if geom and geom.get("type") in {"Polygon", "MultiPolygon"}:
                return remove_z_dimension(shape(geom))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GeometryCollection sem Polygon/MultiPolygon valido.",
        )
    return remove_z_dimension(shape(geometry_data))


def _shape_metrics_ha_km(geom_shape) -> Dict[str, float]:
    # Aproximacao em graus para uso operacional leve.
    area_ha = float(geom_shape.area) * 111320.0 * 111320.0 / 10000.0
    per_km = float(geom_shape.length) * 111.32
    return {
        "area_ha": round(area_ha, 4),
        "perimetro_km": round(per_km, 4),
    }


def _row_to_feature(row: Dict[str, Any], geom_field: str = "geometry") -> Dict[str, Any]:
    geom_raw = row.get(geom_field)
    if isinstance(geom_raw, str):
        geom_data = json.loads(geom_raw)
    else:
        geom_data = geom_raw
    return {
        "type": "Feature",
        "geometry": geom_data,
        "properties": {k: v for k, v in row.items() if k not in {geom_field, "geometry"}},
    }


def _get_reservoir_row_or_404(reservoir_id: int) -> Dict[str, Any]:
    query = select(
        reservoirs_table.c.id,
        reservoirs_table.c.name,
        reservoirs_table.c.description,
        ST_AsGeoJSON(reservoirs_table.c.geom).label("geometry"),
    ).where(reservoirs_table.c.id == reservoir_id)
    with engine.connect() as connection:
        row = connection.execute(query).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservatorio nao encontrado.")
    payload = dict(row)
    payload["geometry"] = json.loads(payload["geometry"])
    return payload


def _resolve_monitoring_geometry(reservoir_id: int, candidate_geometry: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if candidate_geometry:
        return candidate_geometry
    context_query = select(
        ST_AsGeoJSON(reservatorio_contexto_table.c.geom_monitoramento).label("geom_monitoramento")
    ).where(reservatorio_contexto_table.c.reservoir_id == reservoir_id)
    with engine.connect() as connection:
        context_row = connection.execute(context_query).mappings().first()
    if context_row and context_row.get("geom_monitoramento"):
        return json.loads(context_row["geom_monitoramento"])
    reservoir = _get_reservoir_row_or_404(reservoir_id)
    return reservoir["geometry"]


def _persist_analysis(
    *,
    reservoir_id: int,
    tipo_analise: str,
    periodo_inicio: Optional[datetime],
    periodo_fim: Optional[datetime],
    parametros: Dict[str, Any],
    resultado: Dict[str, Any],
    origem_dados: str = "gee",
    duracao_ms: Optional[float] = None,
) -> int:
    insert_query = analise_reservatorio_table.insert().values(
        reservoir_id=reservoir_id,
        tipo_analise=tipo_analise,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        status="completed",
        origem_dados=origem_dados,
        duracao_ms=duracao_ms,
        parametros_json=_to_json_text(parametros),
        resultado_json=_to_json_text(resultado),
    ).returning(analise_reservatorio_table.c.id)
    with engine.connect() as connection:
        tx = connection.begin()
        row = connection.execute(insert_query).mappings().first()
        tx.commit()
    return int(row["id"])


def _persist_alert(
    *,
    reservoir_id: int,
    analysis_id: Optional[int],
    tipo_alerta: str,
    severidade: str,
    mensagem: str,
    valor_metrica: Optional[float],
    valor_limiar: Optional[float],
    contexto: Optional[Dict[str, Any]] = None,
) -> int:
    insert_query = alerta_reservatorio_table.insert().values(
        reservoir_id=reservoir_id,
        analysis_id=analysis_id,
        tipo_alerta=tipo_alerta,
        severidade=severidade,
        mensagem=mensagem,
        valor_metrica=valor_metrica,
        valor_limiar=valor_limiar,
        status="active",
        contexto_json=_to_json_text(contexto or {}),
        data_alerta=datetime.utcnow(),
    ).returning(alerta_reservatorio_table.c.id)
    with engine.connect() as connection:
        tx = connection.begin()
        row = connection.execute(insert_query).mappings().first()
        tx.commit()
    return int(row["id"])


def _persist_indicator(
    *,
    reservoir_id: int,
    indicador_nome: str,
    data_referencia: datetime,
    valor: float,
    unidade: Optional[str],
    metadados: Optional[Dict[str, Any]] = None,
) -> None:
    insert_query = serie_temporal_indicador_table.insert().values(
        reservoir_id=reservoir_id,
        indicador_nome=indicador_nome,
        data_referencia=data_referencia,
        valor=valor,
        unidade=unidade,
        metadados_json=_to_json_text(metadados or {}),
    )
    with engine.connect() as connection:
        tx = connection.begin()
        connection.execute(insert_query)
        tx.commit()


def _get_latest_indicator(reservoir_id: int, indicador_nome: str) -> Optional[Dict[str, Any]]:
    query = (
        select(
            serie_temporal_indicador_table.c.id,
            serie_temporal_indicador_table.c.data_referencia,
            serie_temporal_indicador_table.c.valor,
            serie_temporal_indicador_table.c.unidade,
            serie_temporal_indicador_table.c.metadados_json,
        )
        .where(
            serie_temporal_indicador_table.c.reservoir_id == reservoir_id,
            serie_temporal_indicador_table.c.indicador_nome == indicador_nome,
        )
        .order_by(serie_temporal_indicador_table.c.data_referencia.desc())
        .limit(1)
    )
    with engine.connect() as connection:
        row = connection.execute(query).mappings().first()
    if not row:
        return None
    payload = dict(row)
    payload["metadados"] = _from_json_text(payload.pop("metadados_json", None), {})
    return payload

MAX_EE_GEOMETRY_VERTICES = int(os.getenv("EE_MAX_GEOMETRY_VERTICES", "2500"))
MAX_EE_GEOMETRY_JSON_CHARS = int(os.getenv("EE_MAX_GEOMETRY_JSON_CHARS", "250000"))

def _geometry_vertex_count(geom_shape) -> int:
    if geom_shape is None or getattr(geom_shape, "is_empty", True):
        return 0
    geom_type = geom_shape.geom_type
    if geom_type == "Polygon":
        count = len(getattr(geom_shape.exterior, "coords", []))
        count += sum(len(getattr(ring, "coords", [])) for ring in geom_shape.interiors)
        return count
    if geom_type in {"MultiPolygon", "GeometryCollection"}:
        return sum(_geometry_vertex_count(part) for part in geom_shape.geoms)
    if hasattr(geom_shape, "coords"):
        return len(list(geom_shape.coords))
    return 0

def _is_geometry_too_large_for_ee(geom_shape) -> bool:
    if geom_shape is None or getattr(geom_shape, "is_empty", True):
        return False
    vertices = _geometry_vertex_count(geom_shape)
    if vertices > MAX_EE_GEOMETRY_VERTICES:
        return True
    geojson_size = len(_to_json_text(mapping(geom_shape)))
    return geojson_size > MAX_EE_GEOMETRY_JSON_CHARS

def _simplify_geometry_for_ee(geom_shape):
    if geom_shape is None or getattr(geom_shape, "is_empty", True):
        return geom_shape
    candidate = geom_shape
    if not candidate.is_valid:
        candidate = candidate.buffer(0)
    if not _is_geometry_too_large_for_ee(candidate):
        return candidate

    # Progressive simplification preserving topology.
    for tolerance in (0.00005, 0.0001, 0.0005, 0.001, 0.005, 0.01):
        simplified = candidate.simplify(tolerance, preserve_topology=True)
        if simplified is None or simplified.is_empty:
            continue
        if not simplified.is_valid:
            simplified = simplified.buffer(0)
        if simplified is None or simplified.is_empty:
            continue
        candidate = simplified
        if not _is_geometry_too_large_for_ee(candidate):
            return candidate

    # Hard fallback for oversized geometries.
    return candidate.envelope

def create_ee_geometry_from_json(polygon_data: Dict[str, Any]) -> ee.Geometry:
    if not polygon_data or "type" not in polygon_data:
        raise ValueError("Dados do poligono invalidos.")
    if polygon_data.get("type") == "GeometryCollection":
        if not polygon_data.get("geometries"):
            raise ValueError("GeometryCollection invalida sem geometrias.")
    elif "coordinates" not in polygon_data:
        raise ValueError("Dados do poligono invalidos.")

    geom_shape = _geometry_to_shape(polygon_data)
    safe_geom = _simplify_geometry_for_ee(geom_shape)
    safe_geojson = mapping(safe_geom)
    if _is_geometry_too_large_for_ee(safe_geom):
        _log_event(
            "ee_geometry_reduced_to_envelope",
            vertices=_geometry_vertex_count(geom_shape),
            original_size=len(_to_json_text(mapping(geom_shape))),
        )
        safe_geojson = mapping(geom_shape.envelope)

    return ee.Geometry(safe_geojson)

def _is_cbers_identifier(image_id: Optional[str], satellite_hint: Optional[str] = None) -> bool:
    image_upper = (image_id or "").upper()
    sat_upper = (satellite_hint or "").upper()
    cbers_markers = ("CBERS", "CB4", "CB4A", "AMAZONIA")
    return sat_upper.startswith("CBERS") or any(marker in image_upper for marker in cbers_markers)

def _infer_is_landsat(image_id: Optional[str], satellite_hint: Optional[str] = None) -> bool:
    image_upper = (image_id or "").upper()
    sat_upper = (satellite_hint or "").upper()
    landsat_markers = ("LANDSAT/", "LANDSAT_", "LC08", "LC09", "LE07", "LT05")
    sentinel_markers = ("COPERNICUS/", "SENTINEL", "S2_")
    if any(marker in image_upper for marker in landsat_markers):
        return True
    if any(marker in image_upper for marker in sentinel_markers):
        return False
    if _is_cbers_identifier(image_id, satellite_hint):
        return False
    return sat_upper.startswith("LANDSAT")

async def _resolve_image_is_landsat(image: ee.Image, image_id: Optional[str], satellite_hint: Optional[str] = None) -> bool:
    guessed = _infer_is_landsat(image_id, satellite_hint)
    try:
        band_names = await asyncio.to_thread(image.bandNames().getInfo)
        if isinstance(band_names, list) and band_names:
            normalized = {str(name).upper() for name in band_names}
            has_landsat_profile = any(name.startswith("SR_B") for name in normalized)
            has_sentinel_profile = {"B2", "B3", "B4", "B8", "B11"}.issubset(normalized) or "B8" in normalized
            if has_landsat_profile and not has_sentinel_profile:
                return True
            if has_sentinel_profile and not has_landsat_profile:
                return False
    except Exception:
        pass
    return guessed

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
        'SWIR1': scaled_image.select('SR_B6' if is_landsat else 'B11'),
        'RE1': scaled_image.select('B5') if not is_landsat else ee.Image(0).rename('B5'),
        'RE2': scaled_image.select('B6') if not is_landsat else ee.Image(0).rename('B6'),
        'RE3': scaled_image.select('B7') if not is_landsat else ee.Image(0).rename('B7'),
    }

    add_index('NDVI', '(NIR - RED) / (NIR + RED)', bands)
    add_index('NDWI', '(GREEN - NIR) / (GREEN + NIR)', bands)
    add_index('MNDWI', '(GREEN - SWIR1) / (GREEN + SWIR1)', bands)
    add_index('NDMI', '(NIR - SWIR1) / (NIR + SWIR1)', bands)
    add_index('TURBIDITY_PROXY', '(RED - GREEN) / (RED + GREEN)', bands)
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
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


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
# ENDPOINTS DE ANALISE 3D
# --------------------------------------------------------------------------

NDVI_3D_CLASS_METADATA = {
    1: {"class_name": "Agua", "color": "#4287f5", "ndvi_repr": -0.05},
    2: {"class_name": "Solo Exposto", "color": "#d4a276", "ndvi_repr": 0.12},
    3: {"class_name": "Vegetacao Rala", "color": "#a6d96a", "ndvi_repr": 0.38},
    4: {"class_name": "Vegetacao Densa", "color": "#1a9641", "ndvi_repr": 0.70},
}


def _build_ndvi_2d_classified_image(original_image: ee.Image, is_landsat: bool) -> ee.Image:
    """
    Replica a mesma lógica temática usada no fluxo 2D:
    - Água: NDWI > 0
    - Solo Exposto: SAVI < 0.25 (terra)
    - Vegetação Rala: 0.25 <= SAVI < 0.5
    - Vegetação Densa: SAVI >= 0.5
    """
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

    return (
        ee.Image(0)
        .where(water_mask, 1)
        .where(solo_mask, 2)
        .where(veg_rala_mask, 3)
        .where(veg_densa_mask, 4)
        .selfMask()
        .rename("class_id")
    )


def _coerce_bbox_values(bbox_values: Optional[List[float]]) -> Optional[List[float]]:
    if not bbox_values:
        return None
    if len(bbox_values) != 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bbox invalida. Use quatro valores: minLng,minLat,maxLng,maxLat",
        )
    min_lng, min_lat, max_lng, max_lat = [float(v) for v in bbox_values]
    if min_lng >= max_lng or min_lat >= max_lat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bbox invalida. Garanta min < max.",
        )
    return [min_lng, min_lat, max_lng, max_lat]


def _parse_bbox_text(bbox: Optional[str]) -> Optional[List[float]]:
    if not bbox:
        return None
    try:
        values = [float(value.strip()) for value in bbox.split(",")]
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bbox invalida. Use: minLng,minLat,maxLng,maxLat",
        )
    return _coerce_bbox_values(values)


def _build_ndvi_3d_target_geometry(
    polygon: Optional[Dict[str, Any]],
    bbox_values: Optional[List[float]],
) -> ee.Geometry:
    if polygon:
        return create_ee_geometry_from_json(polygon)
    normalized_bbox = _coerce_bbox_values(bbox_values)
    if normalized_bbox:
        min_lng, min_lat, max_lng, max_lat = normalized_bbox
        return ee.Geometry.Rectangle([min_lng, min_lat, max_lng, max_lat])
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Informe polygon ou bbox para gerar NDVI 3D classificado.",
    )


async def _build_ndvi_3d_grid_response(payload: Ndvi3DRequest) -> Dict[str, Any]:
    try:
        start_date = payload.dateFrom or (date.today() - timedelta(days=45))
        end_date = payload.dateTo or date.today()
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="dateFrom deve ser menor ou igual a dateTo.",
            )

        satellite = (payload.satellite or "SENTINEL_2A").upper()
        collection_name = SATELLITE_COLLECTIONS.get(satellite, SATELLITE_COLLECTIONS["SENTINEL_2A"])
        if satellite.startswith("CBERS"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="NDVI 3D classificado nao suporta CBERS no fluxo atual.",
            )

        geometry = _build_ndvi_3d_target_geometry(payload.polygon, payload.bbox)
        is_landsat = satellite.startswith("LANDSAT")
        cloud_property = "CLOUD_COVER" if is_landsat else "CLOUDY_PIXEL_PERCENTAGE"
        cloud_pct = max(0.0, min(float(payload.cloudPct), 100.0))
        scale = max(10, min(int(payload.scale), 120))
        max_features = max(100, min(int(payload.maxFeatures), 10000))
        simplify_meters = max(0.0, min(float(payload.simplifyMeters), 500.0))

        image_collection = (
            ee.ImageCollection(collection_name)
            .filterBounds(geometry)
            .filterDate(str(start_date), str(end_date))
            .filter(ee.Filter.lte(cloud_property, cloud_pct))
        )
        image_count = int(await asyncio.to_thread(image_collection.size().getInfo) or 0)
        if image_count == 0:
            _log_event(
                "ndvi_3d_grid_empty",
                reason="no_images",
                satellite=satellite,
                date_from=str(start_date),
                date_to=str(end_date),
            )
            return {
                "type": "FeatureCollection",
                "features": [],
                "metadata": {
                    "source": "ndvi_2d_classification_logic",
                    "satellite": satellite,
                    "date_from": str(start_date),
                    "date_to": str(end_date),
                    "scale": scale,
                    "features_count": 0,
                    "image_count": image_count,
                },
            }

        composite = image_collection.median().clip(geometry)
        class_image = _build_ndvi_2d_classified_image(composite, is_landsat).clip(geometry)

        vectors = class_image.reduceToVectors(
            geometry=geometry,
            scale=scale,
            geometryType="polygon",
            eightConnected=False,
            labelProperty="class_id",
            reducer=ee.Reducer.countEvery(),
            maxPixels=1e10,
            bestEffort=True,
            tileScale=4,
        )

        if simplify_meters > 0:
            def simplify_feature(feature):
                simplified = feature.geometry().simplify(maxError=simplify_meters)
                clipped = simplified.intersection(geometry, maxError=1)
                return feature.setGeometry(clipped)

            vectors = vectors.map(simplify_feature)

        vectors = vectors.limit(max_features)
        vectors_geojson = await asyncio.to_thread(vectors.getInfo)
        raw_features = vectors_geojson.get("features", []) if isinstance(vectors_geojson, dict) else []

        features: List[Dict[str, Any]] = []
        for feature in raw_features:
            props = feature.get("properties") or {}
            class_id_raw = props.get("class_id", props.get("label", 0))
            try:
                class_id = int(float(class_id_raw))
            except Exception:
                class_id = 0
            class_meta = NDVI_3D_CLASS_METADATA.get(class_id, NDVI_3D_CLASS_METADATA[2])
            pixel_count = int(props.get("count", 0) or 0)
            area_ha = (pixel_count * scale * scale) / 10000 if pixel_count > 0 else None

            feature["properties"] = {
                "class_id": class_id,
                "class_name": class_meta["class_name"],
                "color": class_meta["color"],
                "ndvi_mean": class_meta["ndvi_repr"],
                "ndvi_repr": class_meta["ndvi_repr"],
                "pixels": pixel_count,
                "area": area_ha,
                "date": str(end_date),
            }
            features.append(feature)

        _log_event(
            "ndvi_3d_grid_built",
            satellite=satellite,
            date_from=str(start_date),
            date_to=str(end_date),
            image_count=image_count,
            features_count=len(features),
            scale=scale,
            simplify_meters=simplify_meters,
        )

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "source": "ndvi_2d_classification_logic",
                "satellite": satellite,
                "date_from": str(start_date),
                "date_to": str(end_date),
                "scale": scale,
                "features_count": len(features),
                "image_count": image_count,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        safe_error = str(e)
        _log_event("ndvi_3d_grid_error", error=safe_error)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao gerar NDVI 3D classificado: {safe_error}",
        )

@app.post("/analysis/ndvi_3d", tags=["Analysis 3D"])
async def post_ndvi_3d(payload: Ndvi3DRequest):
    return await _build_ndvi_3d_grid_response(payload)


@app.get("/analysis/ndvi_3d", tags=["Analysis 3D"])
async def get_ndvi_3d(
    bbox: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    satellite: str = "SENTINEL_2A",
    cloud_pct: float = 40,
    scale: int = 30,
    max_features: int = 2200,
    simplify_meters: float = 20,
):
    start_date = None
    end_date = None
    try:
        if date_from:
            start_date = datetime.strptime(date_from, "%Y-%m-%d").date()
        if date_to:
            end_date = datetime.strptime(date_to, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de data invalido. Use YYYY-MM-DD.",
        )
    payload = Ndvi3DRequest(
        polygon=None,
        bbox=_parse_bbox_text(bbox),
        dateFrom=start_date,
        dateTo=end_date,
        satellite=satellite,
        cloudPct=cloud_pct,
        scale=scale,
        maxFeatures=max_features,
        simplifyMeters=simplify_meters,
    )
    return await _build_ndvi_3d_grid_response(payload)

@app.get("/analysis/dem", tags=["Analysis 3D"])
async def get_dem_tiles(bbox: Optional[str] = None):
    try:
        dem_image = ee.Image("USGS/SRTMGL1_003")
        geometry = None

        if bbox:
            try:
                min_lng, min_lat, max_lng, max_lat = [float(value.strip()) for value in bbox.split(",")]
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="bbox invalida. Use: minLng,minLat,maxLng,maxLat",
                )

            if min_lng >= max_lng or min_lat >= max_lat:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="bbox invalida. Garanta min < max.",
                )

            geometry = ee.Geometry.Rectangle([min_lng, min_lat, max_lng, max_lat], proj="EPSG:4326")
            dem_image = dem_image.clip(geometry)

        vis_params = {
            "min": 0,
            "max": 3000,
            "palette": ["#0b3d2e", "#4f772d", "#90a955", "#dda15e", "#f4a261", "#e9c46a", "#fefae0"],
        }

        map_id = await asyncio.to_thread(dem_image.visualize(**vis_params).getMapId)
        response: Dict[str, Any] = {
            "tileUrl": map_id["tile_fetcher"].url_format,
            "source": "USGS/SRTMGL1_003",
        }
        if bbox:
            response["bbox"] = bbox
        return response
    except HTTPException:
        raise
    except Exception as e:
        print(f"Erro ao gerar analysis/dem: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao gerar DEM: {e}",
        )


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

def _date_to_datetime(value: Optional[date], end_of_day: bool = False) -> Optional[datetime]:
    if value is None:
        return None
    if end_of_day:
        return datetime(value.year, value.month, value.day, 23, 59, 59)
    return datetime(value.year, value.month, value.day, 0, 0, 0)


def _build_context_response(reservoir_payload: Dict[str, Any], context_row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    default_geom = reservoir_payload.get("geometry")
    if not context_row:
        return {
            "reservoir_id": reservoir_payload["id"],
            "reservatorio_nome": reservoir_payload["name"],
            "reservatorio_codigo": None,
            "reservatorio_tipo": None,
            "orgao_responsavel": None,
            "municipio": None,
            "estado": None,
            "status_monitoramento": "active",
            "parametros": {},
            "metadados": {},
            "geom_monitoramento": default_geom,
            "geom_entorno": None,
            "geom_app": None,
            "geom_bacia_imediata": None,
            "updated_at": None,
        }

    return {
        "reservoir_id": reservoir_payload["id"],
        "reservatorio_nome": reservoir_payload["name"],
        "reservatorio_codigo": context_row.get("reservatorio_codigo"),
        "reservatorio_tipo": context_row.get("reservatorio_tipo"),
        "orgao_responsavel": context_row.get("orgao_responsavel"),
        "municipio": context_row.get("municipio"),
        "estado": context_row.get("estado"),
        "status_monitoramento": context_row.get("status_monitoramento") or "active",
        "parametros": _from_json_text(context_row.get("parametros_json"), {}),
        "metadados": _from_json_text(context_row.get("metadados_json"), {}),
        "geom_monitoramento": json.loads(context_row["geom_monitoramento"]) if context_row.get("geom_monitoramento") else default_geom,
        "geom_entorno": json.loads(context_row["geom_entorno"]) if context_row.get("geom_entorno") else None,
        "geom_app": json.loads(context_row["geom_app"]) if context_row.get("geom_app") else None,
        "geom_bacia_imediata": json.loads(context_row["geom_bacia_imediata"]) if context_row.get("geom_bacia_imediata") else None,
        "updated_at": context_row["updated_at"].isoformat() + "Z" if context_row.get("updated_at") else None,
    }


@app.get("/api/reservoir-monitoring/reservoirs/{reservoir_id}/context", tags=["Reservoir Monitoring"])
async def get_reservoir_monitoring_context(reservoir_id: int):
    reservoir_payload = _get_reservoir_row_or_404(reservoir_id)
    query = select(
        reservatorio_contexto_table.c.reservatorio_codigo,
        reservatorio_contexto_table.c.reservatorio_tipo,
        reservatorio_contexto_table.c.orgao_responsavel,
        reservatorio_contexto_table.c.municipio,
        reservatorio_contexto_table.c.estado,
        reservatorio_contexto_table.c.status_monitoramento,
        reservatorio_contexto_table.c.parametros_json,
        reservatorio_contexto_table.c.metadados_json,
        reservatorio_contexto_table.c.updated_at,
        ST_AsGeoJSON(reservatorio_contexto_table.c.geom_monitoramento).label("geom_monitoramento"),
        ST_AsGeoJSON(reservatorio_contexto_table.c.geom_entorno).label("geom_entorno"),
        ST_AsGeoJSON(reservatorio_contexto_table.c.geom_app).label("geom_app"),
        ST_AsGeoJSON(reservatorio_contexto_table.c.geom_bacia_imediata).label("geom_bacia_imediata"),
    ).where(reservatorio_contexto_table.c.reservoir_id == reservoir_id)
    with engine.connect() as connection:
        row = connection.execute(query).mappings().first()
    return _build_context_response(reservoir_payload, dict(row) if row else None)


@app.put("/api/reservoir-monitoring/reservoirs/{reservoir_id}/context", tags=["Reservoir Monitoring"])
async def upsert_reservoir_monitoring_context(reservoir_id: int, payload: ReservoirMonitoringContextUpsert):
    _get_reservoir_row_or_404(reservoir_id)
    now = datetime.utcnow()

    geom_monitoramento_wkt = f"SRID=4326;{_geometry_to_shape(payload.geom_monitoramento).wkt}" if payload.geom_monitoramento else None
    geom_entorno_wkt = f"SRID=4326;{_geometry_to_shape(payload.geom_entorno).wkt}" if payload.geom_entorno else None
    geom_app_wkt = f"SRID=4326;{_geometry_to_shape(payload.geom_app).wkt}" if payload.geom_app else None
    geom_bacia_wkt = f"SRID=4326;{_geometry_to_shape(payload.geom_bacia_imediata).wkt}" if payload.geom_bacia_imediata else None

    values = {
        "reservatorio_codigo": payload.reservatorio_codigo,
        "reservatorio_tipo": payload.reservatorio_tipo,
        "orgao_responsavel": payload.orgao_responsavel,
        "municipio": payload.municipio,
        "estado": payload.estado,
        "status_monitoramento": payload.status_monitoramento,
        "parametros_json": _to_json_text(payload.parametros),
        "metadados_json": _to_json_text(payload.metadados),
        "geom_monitoramento": geom_monitoramento_wkt,
        "geom_entorno": geom_entorno_wkt,
        "geom_app": geom_app_wkt,
        "geom_bacia_imediata": geom_bacia_wkt,
        "updated_at": now,
    }

    check_query = select(reservatorio_contexto_table.c.id).where(reservatorio_contexto_table.c.reservoir_id == reservoir_id)
    with engine.connect() as connection:
        tx = connection.begin()
        existing = connection.execute(check_query).scalar_one_or_none()
        if existing is None:
            connection.execute(
                reservatorio_contexto_table.insert().values(
                    reservoir_id=reservoir_id,
                    created_at=now,
                    **values,
                )
            )
        else:
            connection.execute(
                reservatorio_contexto_table.update()
                .where(reservatorio_contexto_table.c.reservoir_id == reservoir_id)
                .values(**values)
            )
        tx.commit()

    _log_event(
        "context_upsert",
        reservoir_id=reservoir_id,
        status_monitoramento=payload.status_monitoramento,
        has_geom_monitoramento=bool(payload.geom_monitoramento),
    )
    return await get_reservoir_monitoring_context(reservoir_id)


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/areas", tags=["Reservoir Monitoring"])
async def create_reservoir_monitoring_area(reservoir_id: int, payload: ReservoirAreaCreate):
    _get_reservoir_row_or_404(reservoir_id)
    geom_shape = _geometry_to_shape(payload.geometry)
    metrics = _shape_metrics_ha_km(geom_shape)
    insert_query = (
        reservatorio_area_monitoramento_table.insert()
        .values(
            reservoir_id=reservoir_id,
            nome_area=payload.nome_area,
            tipo_area=payload.tipo_area,
            geom=f"SRID=4326;{geom_shape.wkt}",
            area_ha=metrics["area_ha"],
            perimetro_km=metrics["perimetro_km"],
            created_at=datetime.utcnow(),
        )
        .returning(reservatorio_area_monitoramento_table.c.id)
    )
    with engine.connect() as connection:
        tx = connection.begin()
        row = connection.execute(insert_query).mappings().first()
        new_id = int(row["id"])
        if payload.tipo_area.lower() in {"app", "faixa_marginal", "app_faixa_marginal"}:
            connection.execute(
                reservatorio_app_table.insert().values(
                    reservoir_id=reservoir_id,
                    nome=payload.nome_area or "APP",
                    limiar_degradacao=payload.limiar_degradacao if payload.limiar_degradacao is not None else 0.15,
                    geom=f"SRID=4326;{geom_shape.wkt}",
                    area_ha=metrics["area_ha"],
                    created_at=datetime.utcnow(),
                )
            )
        tx.commit()

    _log_event(
        "monitoring_area_created",
        reservoir_id=reservoir_id,
        tipo_area=payload.tipo_area,
        area_ha=metrics["area_ha"],
    )
    return {
        "id": new_id,
        "reservoir_id": reservoir_id,
        "nome_area": payload.nome_area,
        "tipo_area": payload.tipo_area,
        **metrics,
    }


@app.get("/api/reservoir-monitoring/reservoirs/{reservoir_id}/areas", tags=["Reservoir Monitoring"])
async def list_reservoir_monitoring_areas(reservoir_id: int):
    _get_reservoir_row_or_404(reservoir_id)
    query = (
        select(
            reservatorio_area_monitoramento_table.c.id,
            reservatorio_area_monitoramento_table.c.nome_area,
            reservatorio_area_monitoramento_table.c.tipo_area,
            reservatorio_area_monitoramento_table.c.area_ha,
            reservatorio_area_monitoramento_table.c.perimetro_km,
            ST_AsGeoJSON(reservatorio_area_monitoramento_table.c.geom).label("geometry"),
        )
        .where(reservatorio_area_monitoramento_table.c.reservoir_id == reservoir_id)
        .order_by(reservatorio_area_monitoramento_table.c.created_at.desc())
    )
    features: List[Dict[str, Any]] = []
    with engine.connect() as connection:
        rows = connection.execute(query).mappings().all()
    for row in rows:
        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(row["geometry"]),
                "properties": {
                    "id": int(row["id"]),
                    "nome_area": row["nome_area"],
                    "tipo_area": row["tipo_area"],
                    "area_ha": float(row["area_ha"] or 0.0),
                    "perimetro_km": float(row["perimetro_km"] or 0.0),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


@app.delete("/api/reservoir-monitoring/reservoirs/{reservoir_id}/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Reservoir Monitoring"])
async def delete_reservoir_monitoring_area(reservoir_id: int, area_id: int):
    _get_reservoir_row_or_404(reservoir_id)
    delete_query = reservatorio_area_monitoramento_table.delete().where(
        reservatorio_area_monitoramento_table.c.id == area_id,
        reservatorio_area_monitoramento_table.c.reservoir_id == reservoir_id,
    )
    with engine.connect() as connection:
        tx = connection.begin()
        result = connection.execute(delete_query)
        tx.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Area de monitoramento nao encontrada.")
    return


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/images/search", response_model=List[ImageInfo], tags=["Reservoir Monitoring"])
async def search_reservoir_images(reservoir_id: int, payload: ReservoirImageSearchRequest):
    _get_reservoir_row_or_404(reservoir_id)
    search_polygon = _resolve_monitoring_geometry(reservoir_id, payload.polygon)
    _log_event(
        "imagery_search_start",
        reservoir_id=reservoir_id,
        satellite=payload.satellite,
        date_from=str(payload.dateFrom),
        date_to=str(payload.dateTo),
        cloud_pct=payload.cloudPct,
    )
    started = datetime.utcnow()
    images = await search_earth_images(
        SearchRequest(
            dateFrom=payload.dateFrom,
            dateTo=payload.dateTo,
            cloudPct=payload.cloudPct,
            satellite=payload.satellite,
            polygon=search_polygon,
            maxResults=payload.maxResults,
        )
    )
    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="image_search",
        periodo_inicio=_date_to_datetime(payload.dateFrom),
        periodo_fim=_date_to_datetime(payload.dateTo, end_of_day=True),
        parametros={
            "satellite": payload.satellite,
            "cloud_pct": payload.cloudPct,
        },
        resultado={"images_found": len(images)},
        duracao_ms=(datetime.utcnow() - started).total_seconds() * 1000.0,
    )

    with engine.connect() as connection:
        tx = connection.begin()
        for item in images:
            connection.execute(
                imagem_reservatorio_table.insert().values(
                    reservoir_id=reservoir_id,
                    image_id=item.id,
                    satellite=payload.satellite,
                    acquired_at=_safe_parse_ddmmyyyy(item.date),
                    cloud_pct=payload.cloudPct,
                    thumbnail_url=item.thumbnailUrl,
                    metadados_json=_to_json_text({"analysis_id": analysis_id}),
                    created_at=datetime.utcnow(),
                )
            )
        tx.commit()
    _log_event("imagery_search_done", reservoir_id=reservoir_id, analysis_id=analysis_id, images_found=len(images))
    return images


# === ENDPOINTS DO GOOGLE EARTH ENGINE ===
@app.post("/api/earth-images/search", response_model=List[ImageInfo], tags=["Google Earth Engine"])
async def search_earth_images(request: SearchRequest):
    try:
        max_results = max(1, min(int(request.maxResults or 30), 120))
        collection_name = SATELLITE_COLLECTIONS.get(request.satellite)
        if not collection_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SatÃ©lite invÃ¡lido.")
        
        if request.satellite.startswith("CBERS"):
            # --- Lógica para CBERS via STAC (INPE) ---
            try:
                geom_shape = shape(request.polygon)
                bounds = geom_shape.bounds # (minx, miny, maxx, maxy)
                
                stac_url = os.getenv("BDC_STAC_SEARCH_URL", CBERS_STAC_SEARCH_URL).strip()
                candidate_collections = CBERS_STAC_COLLECTION_CANDIDATES.get(request.satellite, [collection_name])

                base_payload = {
                    "bbox": list(bounds),
                    "datetime": f"{request.dateFrom.isoformat()}T00:00:00Z/{request.dateTo.isoformat()}T23:59:59Z",
                    "limit": min(max_results, 100)
                }
                
                headers = {
                    "Content-Type": "application/json",
                    "User-Agent": "WebGIS-MVP/1.0",
                    "Accept": "application/json, application/geo+json"
                }
                
                features = []
                async with httpx.AsyncClient(timeout=30.0) as client:
                    for candidate_collection in candidate_collections:
                        payload = {**base_payload, "collections": [candidate_collection]}
                        response = None
                        last_exception = None
                        for attempt in range(3):
                            try:
                                response = await client.post(stac_url, json=payload, headers=headers)
                                response.raise_for_status()
                                break
                            except httpx.HTTPStatusError as e:
                                last_exception = e
                                if attempt < 2:
                                    await asyncio.sleep(1)
                            except httpx.RequestError as e:
                                last_exception = e
                                if attempt < 2:
                                    await asyncio.sleep(1)

                        if response is None:
                            continue

                        try:
                            data = response.json()
                        except json.JSONDecodeError:
                            data = {}

                        current_features = data.get("features", [])
                        if current_features:
                            features = current_features
                            break

                        if last_exception and attempt == 2:
                            print(f"Aviso STAC ({candidate_collection}): {last_exception}")

                if not features:
                    return []
                results = []
                
                for feat in features:
                    props = feat.get("properties", {})
                    assets = feat.get("assets", {})
                    
                    # O campo de nuvens pode vir vazio em algumas coleções CBERS.
                    raw_cloud_cover = props.get("eo:cloud_cover")
                    if raw_cloud_cover in (None, ""):
                        raw_cloud_cover = props.get("cloud_cover")
                    cloud_cover = None
                    if raw_cloud_cover not in (None, ""):
                        try:
                            cloud_cover = float(raw_cloud_cover)
                        except (TypeError, ValueError):
                            cloud_cover = None

                    if cloud_cover is not None and cloud_cover > request.cloudPct:
                        continue

                    dt_str = props.get("datetime", "")
                    try:
                        # Tenta formatar a data ISO
                        dt_obj = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                        date_formatted = dt_obj.strftime('%d/%m/%Y')
                    except Exception:
                        date_formatted = dt_str

                    thumbnail_url = assets.get("thumbnail", {}).get("href", "")
                    if not thumbnail_url:
                        thumbnail_url = assets.get("quicklook", {}).get("href", "")
                    if not thumbnail_url:
                        thumbnail_url = assets.get("preview", {}).get("href", "")
                    
                    results.append(ImageInfo(
                        id=feat["id"],
                        date=date_formatted,
                        thumbnailUrl=thumbnail_url
                    ))
                return results

            except httpx.HTTPError as re:
                error_detail = f"Erro de conexão ao consultar API STAC do INPE: {str(re)}"
                if hasattr(re, 'response') and re.response is not None:
                    error_detail += f" | Status: {re.response.status_code} | Body: {re.response.text[:200]}"
                print(f"❌ {error_detail}")
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error_detail)
            
        else:
            # --- Lógica Existente para Landsat/Sentinel via GEE ---
            geometry = create_ee_geometry_from_json(request.polygon)
            is_landsat = request.satellite.upper().startswith("LANDSAT")
            cloud_property = 'CLOUD_COVER' if is_landsat else 'CLOUDY_PIXEL_PERCENTAGE'
            image_collection = (
                ee.ImageCollection(collection_name)
                .filterBounds(geometry)
                .filterDate(str(request.dateFrom), str(request.dateTo))
                .filter(ee.Filter.lt(cloud_property, request.cloudPct))
                .sort('system:time_start', False)
                .limit(max_results)
            )
            images_info_result = await asyncio.to_thread(image_collection.getInfo)
            images_list_info = images_info_result.get('features', [])[:max_results]
            
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
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        safe_error = _safe_ascii_text(e)
        _log_event("imagery_search_error", satellite=request.satellite, error=safe_error)
        print(f"Erro inesperado ao buscar imagens: {safe_error}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno: {safe_error}")


@app.post(
    "/api/earth-images/refine-classification",
    response_model=RefineClassificationResponse,
    tags=["Google Earth Engine"],
)
async def refine_classification(request: RefineClassificationRequest):
    """
    Reclassifica apenas refinement_polygon e mescla sobre a classificacao base.
    Suporta:
    - base_classification_id (cache interno do modulo LULC)
    - base_classification_asset + source_aoi/date_start/date_end
    """
    try:
        refined = refine_landcover(
            base_classification_id=request.base_classification_id,
            base_classification_asset=request.base_classification_asset,
            refinement_polygon_geojson=request.refinement_polygon,
            new_training_samples_fc=request.new_training_samples,
            classes_input=[c.model_dump() for c in request.classes] if request.classes else None,
            source_aoi_geojson=request.source_aoi,
            date_start=request.date_start,
            date_end=request.date_end,
        )
        return RefineClassificationResponse(
            classification_id=refined.classification_id,
            tile_url=refined.tile_url,
            legend=refined.legend,
            class_stats=refined.class_stats,
            export_url=refined.download_url,
        )
    except HTTPException:
        raise
    except Exception as e:
        safe_error = str(e).encode("ascii", "ignore").decode("ascii")
        print(f"Erro ao refinar classificacao: {safe_error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao refinar classificacao: {safe_error}",
        )

@app.post("/api/earth-images/preview", tags=["Google Earth Engine"])
async def get_image_preview_layer(request: ImagePreviewRequest, http_request: Request):
    try:
        if _is_cbers_identifier(request.imageId, request.satellite):
            stac_url = os.getenv("BDC_STAC_SEARCH_URL", CBERS_STAC_SEARCH_URL).strip()
            candidate_collections = CBERS_STAC_COLLECTION_CANDIDATES.get(
                request.satellite,
                [SATELLITE_COLLECTIONS.get(request.satellite, "")]
            )
            candidate_collections = [c for c in candidate_collections if c]

            payload = {
                "ids": [request.imageId],
                "collections": candidate_collections,
                "limit": 1,
            }
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "WebGIS-MVP/1.0",
                "Accept": "application/json, application/geo+json",
            }

            async with httpx.AsyncClient(timeout=25.0) as client:
                response = await client.post(stac_url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()

            features = data.get("features", [])
            if not features:
                raise HTTPException(status_code=404, detail="Cena CBERS nao encontrada no STAC.")

            feature = features[0]
            assets = feature.get("assets", {})
            image_overlay_url = (
                assets.get("thumbnail", {}).get("href")
                or assets.get("quicklook", {}).get("href")
                or assets.get("preview", {}).get("href")
                or ""
            )

            if not image_overlay_url:
                raise HTTPException(status_code=404, detail="Cena CBERS sem miniatura para pre-visualizacao.")

            bbox = feature.get("bbox")
            if not bbox or len(bbox) < 4:
                geometry_dict = feature.get("geometry")
                if not geometry_dict:
                    raise HTTPException(status_code=404, detail="Cena CBERS sem geometria/bbox para pre-visualizacao.")
                geom_shape = shape(geometry_dict)
                min_lng, min_lat, max_lng, max_lat = geom_shape.bounds
            else:
                min_lng, min_lat, max_lng, max_lat = bbox[:4]

            parsed_source = urlparse(image_overlay_url)
            allowed_hosts = {"data.inpe.br", "www.data.inpe.br"}
            if parsed_source.scheme not in ("http", "https") or parsed_source.hostname not in allowed_hosts:
                raise HTTPException(status_code=400, detail="URL de imagem CBERS invalida para proxy.")

            encoded_source = quote(image_overlay_url, safe="")
            proxy_url = f"{str(http_request.base_url).rstrip('/')}/api/earth-images/cbers-preview-image?source={encoded_source}"

            # Leaflet bounds format: [[south, west], [north, east]]
            overlay_bounds = [[min_lat, min_lng], [max_lat, max_lng]]
            return {
                "imageOverlayUrl": proxy_url,
                "imageOverlayBounds": overlay_bounds,
            }

        image = ee.Image(request.imageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        is_landsat = await _resolve_image_is_landsat(image, request.imageId, request.satellite)
        scaled_image = get_image_bands(image, is_landsat)
        vis_params = {'bands': ['SR_B4', 'SR_B3', 'SR_B2'] if is_landsat else ['B4', 'B3', 'B2'], 'min': 0.0, 'max': 0.3}
        clipped_image = scaled_image.clip(geometry)
        visualized_image = clipped_image.visualize(**vis_params)
        map_id = await asyncio.to_thread(visualized_image.getMapId)
        return {"tileUrl": map_id['tile_fetcher'].url_format}
    except asyncio.CancelledError:
        print("Aviso: geracao de preview cancelada.")
        raise HTTPException(status_code=status.HTTP_408_REQUEST_TIMEOUT, detail="A requisiÃ§Ã£o foi cancelada ou excedeu o tempo limite.")
    except HTTPException:
        raise
    except Exception as e:
        safe_error = _safe_ascii_text(e)
        print(f"Erro ao gerar preview: {safe_error}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Erro ao gerar preview: {safe_error}")


@app.get("/api/earth-images/cbers-preview-image", tags=["Google Earth Engine"])
async def get_cbers_preview_image(source: str):
    parsed = urlparse(source)
    allowed_hosts = {"data.inpe.br", "www.data.inpe.br"}
    if parsed.scheme not in ("http", "https") or parsed.hostname not in allowed_hosts:
        raise HTTPException(status_code=400, detail="URL de origem invalida.")

    try:
        headers = {
            "User-Agent": "WebGIS-MVP/1.0",
            "Accept": "image/png,image/*;q=0.9,*/*;q=0.8",
        }
        async with httpx.AsyncClient(timeout=35.0, follow_redirects=True) as client:
            resp = await client.get(source, headers=headers)
            resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "image/png")
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except httpx.HTTPError as e:
        detail = str(e).encode("ascii", "ignore").decode("ascii")
        raise HTTPException(status_code=502, detail=f"Falha ao baixar imagem CBERS: {detail}")

@app.post("/api/earth-images/indices", response_model=IndicesResponse, tags=["Google Earth Engine"])
async def generate_indices(request: IndicesRequest):
    try:
        if _is_cbers_identifier(request.imageId, request.satellite):
            raise HTTPException(status_code=400, detail="O processamento avançado (NDVI, Índices) para o satélite CBERS estará disponível numa versão futura. Por favor, utilize Landsat ou Sentinel para estas análises.")

        if not request.indices:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A lista de Ã­ndices nÃ£o pode ser vazia.")
        
        image = ee.Image(request.imageId)
        is_landsat = await _resolve_image_is_landsat(image, request.imageId, request.satellite)
        if "RED-EDGE NDVI" in {idx.upper() for idx in request.indices} and is_landsat:
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Red-Edge NDVI sÃ³ pode ser calculado para satÃ©lites Sentinel-2.")

        geometry = create_ee_geometry_from_json(request.polygon)
        calculated_indices = calculate_indices_gee(image, is_landsat, request.indices)
        
        results = []
        vis_params_index = {'min': 0, 'max': 1, 'palette': ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641']}
        
        for index_name, index_image in calculated_indices.items():
            clipped_index_image = index_image.clip(geometry)
            classification_data = None
            
            scale = 30 if is_landsat else 10
            pixel_area = scale * scale
            sensor_str = "Landsat" if is_landsat else "Sentinel"

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

            try:
                map_id = await asyncio.to_thread(clipped_index_image.getMapId, vis_params_index)
            except Exception as map_exc:
                _log_event(
                    "index_map_fallback_to_bounds",
                    index_name=index_name,
                    image_id=request.imageId,
                    error=_safe_ascii_text(map_exc),
                )
                map_id = await asyncio.to_thread(index_image.clip(geometry.bounds(maxError=1)).getMapId, vis_params_index)

            download_url = None
            try:
                download_url = await asyncio.to_thread(
                    index_image.getDownloadURL,
                    {
                        "scale": scale,
                        "crs": "EPSG:4326",
                        "region": geometry.bounds(maxError=1),
                        "format": "GEO_TIFF",
                    },
                )
            except Exception as download_exc:
                _log_event(
                    "index_download_url_unavailable",
                    index_name=index_name,
                    image_id=request.imageId,
                    error=_safe_ascii_text(download_exc),
                )

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
        safe_error = _safe_ascii_text(e)
        _log_event("index_generation_error", image_id=request.imageId, error=safe_error)
        print(f"Erro inesperado ao gerar indices: {safe_error}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ocorreu um erro interno: {safe_error}")

@app.post("/api/earth-images/change-detection", response_model=ChangeDetectionResponse, tags=["Google Earth Engine"])
async def detect_changes(request: ChangeDetectionRequest):
    try:
        if _is_cbers_identifier(request.beforeImageId, request.satellite) or _is_cbers_identifier(request.afterImageId, request.satellite):
            raise HTTPException(status_code=400, detail="O processamento avançado (Detecção de Mudanças) para o satélite CBERS estará disponível numa versão futura. Por favor, utilize Landsat ou Sentinel para estas análises.")

        before_image = ee.Image(request.beforeImageId)
        after_image = ee.Image(request.afterImageId)
        geometry = create_ee_geometry_from_json(request.polygon)
        before_is_landsat = await _resolve_image_is_landsat(before_image, request.beforeImageId, request.satellite)
        after_is_landsat = await _resolve_image_is_landsat(after_image, request.afterImageId, request.satellite)

        before_ndvi = calculate_indices_gee(before_image, before_is_landsat, ['NDVI'])['NDVI']
        after_ndvi = calculate_indices_gee(after_image, after_is_landsat, ['NDVI'])['NDVI']

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
        # Como não temos o satélite no request deste endpoint específico no código original,
        # verificamos se o ID da imagem parece ser do CBERS (padrão do STAC INPE geralmente contém CBERS)
        if "CBERS" in request.imageId.upper():
             raise HTTPException(status_code=400, detail="O download direto (GeoTIFF) para o satélite CBERS via esta ferramenta estará disponível numa versão futura.")

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


def _extract_numeric_stats(stats: Dict[str, Any], index_name: str) -> Dict[str, Optional[float]]:
    min_key = f"{index_name}_min"
    max_key = f"{index_name}_max"
    mean_key = f"{index_name}_mean"
    min_val = stats.get(min_key)
    max_val = stats.get(max_key)
    mean_val = stats.get(mean_key)
    return {
        "min": float(min_val) if min_val is not None else None,
        "max": float(max_val) if max_val is not None else None,
        "mean": float(mean_val) if mean_val is not None else None,
    }


def _compute_lulc_stats(classified_img: ee.Image, geometry: ee.Geometry, classes: List[Dict[str, Any]], scale: int) -> List[Dict[str, Any]]:
    grouped = (
        ee.Image.pixelArea()
        .addBands(classified_img.rename("class_id"))
        .reduceRegion(
            reducer=ee.Reducer.sum().group(groupField=1, groupName="class_id"),
            geometry=geometry,
            scale=scale,
            maxPixels=1e13,
            bestEffort=True,
        )
        .get("groups")
    )
    grouped_info = grouped.getInfo() if grouped else []
    area_by_class = {int(item["class_id"]): float(item["sum"]) / 10000.0 for item in grouped_info}
    total_area = sum(area_by_class.values()) or 1.0
    stats: List[Dict[str, Any]] = []
    for item in classes:
        area_ha = float(area_by_class.get(item["id"], 0.0))
        stats.append(
            {
                "class_id": item["id"],
                "class_name": item["name"],
                "color": item["color"],
                "area_ha": round(area_ha, 4),
                "area_pct": round((area_ha / total_area) * 100.0, 3),
            }
        )
    return stats


def _build_reservoir_ai_heuristic(payload: Dict[str, Any]) -> Dict[str, Any]:
    alerts = payload.get("alerts", [])
    latest_water = payload.get("latest_water")
    latest_riparian = payload.get("latest_riparian")
    latest_turbidity = payload.get("latest_turbidity")
    lines: List[str] = []
    limitations: List[str] = [
        "Indicadores de assoreamento e turbidez sao proxies espectrais indiretos.",
        "Resultados dependem de cobertura de nuvem, qualidade radiometrica e resolucao espacial.",
    ]

    if latest_water:
        var_pct = latest_water.get("variacao_percentual")
        area_ha = latest_water.get("area_ha")
        if var_pct is not None:
            lines.append(
                f"Espelho d'agua estimado em {area_ha:.2f} ha com variacao de {var_pct:.2f}% no periodo recente."
            )
        else:
            lines.append(f"Espelho d'agua estimado em {area_ha:.2f} ha na ultima analise.")

    if latest_riparian and latest_riparian.get("variacao_pct") is not None:
        lines.append(
            f"Indice de vegetacao ciliar apresentou variacao de {latest_riparian['variacao_pct']:.2f}%."
        )

    if latest_turbidity and latest_turbidity.get("valor") is not None:
        lines.append(
            f"Proxy de turbidez (NDTI) registrado em {latest_turbidity['valor']:.4f}."
        )

    if alerts:
        sev_order = {"high": 3, "medium": 2, "low": 1}
        top = sorted(alerts, key=lambda a: sev_order.get(str(a.get("severidade", "")).lower(), 0), reverse=True)[0]
        lines.append(f"Alerta prioritario: {top.get('mensagem')}")
    else:
        lines.append("Nao ha alertas ativos no momento.")

    recommendation = (
        "Recomenda-se validacao de campo para trechos criticos, monitoramento quinzenal e revisao dos limiares configurados."
    )
    summary = " ".join(lines).strip()
    return {
        "resumo_executivo": summary,
        "diagnostico": summary,
        "recomendacoes": recommendation,
        "confianca": "media",
        "limitacoes": " ".join(limitations),
        "source": "heuristic",
    }


RESERVOIR_AI_SYSTEM_PROMPT = """
Voce e um analista ambiental especialista em monitoramento de reservatorios.
Use exclusivamente os dados recebidos no payload.
Nao invente fatos, valores ou eventos.
Se um dado nao estiver presente, declare explicitamente a limitacao.
Classifique claramente o que e medicao direta e o que e indicador indireto/proxy.
Retorne somente JSON com as chaves:
- resumo_executivo
- diagnostico
- recomendacoes
- confianca (baixa, media ou alta)
- limitacoes
""".strip()


def _call_llm_reservoir_insight(payload: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
    provider = os.getenv("RESERVOIR_AI_PROVIDER", "openai").strip().lower()
    if provider in {"heuristic", "off", "disabled", "none"}:
        return fallback

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return fallback

    model = os.getenv("OPENAI_RESERVOIR_MODEL", "").strip() or os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    explicit_url = os.getenv("OPENAI_CHAT_COMPLETIONS_URL", "").strip()
    if explicit_url:
        chat_url = explicit_url
    else:
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
        chat_url = f"{base_url}/chat/completions"

    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": RESERVOIR_AI_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(chat_url, headers=headers, json=body, timeout=60)
        if not response.ok:
            _log_event(
                "reservoir_ai_provider_error",
                status_code=response.status_code,
                detail=(response.text or "")[:240],
                provider=provider,
            )
            return fallback

        parsed = response.json()
        content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        try:
            content_json = json.loads(content) if isinstance(content, str) else {}
        except json.JSONDecodeError:
            return fallback

        resumo = str(content_json.get("resumo_executivo", "")).strip()
        diagnostico = str(content_json.get("diagnostico", "")).strip()
        recomendacoes = str(content_json.get("recomendacoes", "")).strip()
        limitacoes = str(content_json.get("limitacoes", "")).strip()
        confianca = str(content_json.get("confianca", "media")).strip().lower()
        if confianca not in {"baixa", "media", "alta"}:
            confianca = "media"

        if not resumo or not diagnostico:
            return fallback

        return {
            "resumo_executivo": resumo,
            "diagnostico": diagnostico,
            "recomendacoes": recomendacoes or fallback.get("recomendacoes", ""),
            "confianca": confianca,
            "limitacoes": limitacoes or fallback.get("limitacoes", ""),
            "source": "openai",
            "model": model,
        }
    except Exception as exc:
        _log_event("reservoir_ai_provider_exception", error=str(exc), provider=provider)
        return fallback


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/indices", tags=["Reservoir Monitoring"])
async def run_reservoir_indices(reservoir_id: int, payload: ReservoirIndicesRequest):
    _get_reservoir_row_or_404(reservoir_id)
    if not payload.indices:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lista de indices vazia.")

    polygon = _resolve_monitoring_geometry(reservoir_id, payload.polygon)
    started = datetime.utcnow()
    response = await generate_indices(
        IndicesRequest(
            imageId=payload.imageId,
            satellite=payload.satellite,
            polygon=polygon,
            indices=payload.indices,
        )
    )

    ee_geometry = create_ee_geometry_from_json(polygon)
    image = ee.Image(payload.imageId)
    is_landsat = await _resolve_image_is_landsat(image, payload.imageId, payload.satellite)
    scale = 30 if is_landsat else 10
    image_date_str = await asyncio.to_thread(ee.Date(image.get("system:time_start")).format("YYYY-MM-dd").getInfo)
    image_date = datetime.strptime(image_date_str, "%Y-%m-%d") if image_date_str else datetime.utcnow()
    indices_map = calculate_indices_gee(image, is_landsat, payload.indices)

    stats_by_index: Dict[str, Dict[str, Optional[float]]] = {}
    for index_name, index_image in indices_map.items():
        clipped = index_image.clip(ee_geometry)
        reduce_result = await asyncio.to_thread(
            clipped.reduceRegion(
                reducer=ee.Reducer.minMax().combine(reducer2=ee.Reducer.mean(), sharedInputs=True),
                geometry=ee_geometry,
                scale=scale,
                maxPixels=1e10,
            ).getInfo
        )
        stats = _extract_numeric_stats(reduce_result or {}, index_name)
        stats_by_index[index_name] = stats

    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="indices",
        periodo_inicio=image_date,
        periodo_fim=image_date,
        parametros={
            "image_id": payload.imageId,
            "satellite": payload.satellite,
            "indices": payload.indices,
        },
        resultado={"stats": stats_by_index},
        duracao_ms=(datetime.utcnow() - started).total_seconds() * 1000.0,
    )

    with engine.connect() as connection:
        tx = connection.begin()
        for result in response.results:
            stats = stats_by_index.get(result.indexName, {})
            connection.execute(
                resultado_indice_table.insert().values(
                    reservoir_id=reservoir_id,
                    analysis_id=analysis_id,
                    image_id=payload.imageId,
                    indice_nome=result.indexName,
                    valor_min=stats.get("min"),
                    valor_max=stats.get("max"),
                    valor_medio=stats.get("mean"),
                    tile_url=result.imageUrl,
                    download_url=result.downloadUrl,
                    estatisticas_json=_to_json_text(
                        {
                            "classification": result.classification,
                            "stats": stats,
                        }
                    ),
                    created_at=datetime.utcnow(),
                )
            )
            mean_value = stats.get("mean")
            if mean_value is not None:
                _persist_indicator(
                    reservoir_id=reservoir_id,
                    indicador_nome=f"{result.indexName.lower()}_mean",
                    data_referencia=image_date,
                    valor=float(mean_value),
                    unidade="index",
                    metadados={"analysis_id": analysis_id, "image_id": payload.imageId},
                )
        tx.commit()

    return {
        "analysis_id": analysis_id,
        "bounds": response.bounds,
        "results": [item.model_dump() for item in response.results],
        "stats_by_index": stats_by_index,
        "image_date": image_date_str,
    }


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/waterbody/extract", tags=["Reservoir Monitoring"])
async def extract_reservoir_waterbody(reservoir_id: int, payload: ReservoirWaterbodyRequest):
    _get_reservoir_row_or_404(reservoir_id)
    polygon = _resolve_monitoring_geometry(reservoir_id, payload.polygon)
    started = datetime.utcnow()

    ee_geometry = create_ee_geometry_from_json(polygon)
    image = ee.Image(payload.imageId)
    is_landsat = await _resolve_image_is_landsat(image, payload.imageId, payload.satellite)
    scale = 30 if is_landsat else 10
    index_name = payload.index_name.upper().strip()
    idx_map = calculate_indices_gee(image, is_landsat, [index_name])
    if index_name not in idx_map:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Indice nao suportado para extracao: {index_name}")

    idx_image = idx_map[index_name].clip(ee_geometry)
    water_mask = idx_image.gt(payload.threshold).selfMask()
    water_mask_clean = water_mask.focal_max(1).focal_min(1)

    water_area_m2 = await asyncio.to_thread(
        water_mask_clean.multiply(ee.Image.pixelArea())
        .reduceRegion(reducer=ee.Reducer.sum(), geometry=ee_geometry, scale=scale, maxPixels=1e10)
        .getInfo
    )
    area_val = 0.0
    if water_area_m2:
        first_value = next(iter(water_area_m2.values()))
        area_val = float(first_value or 0.0) / 10000.0

    water_geojson: Dict[str, Any] = {"type": "FeatureCollection", "features": []}
    try:
        vectors = water_mask_clean.reduceToVectors(
            geometry=ee_geometry,
            scale=scale,
            geometryType="polygon",
            maxPixels=1e10,
            bestEffort=True,
        )
        water_geojson = await asyncio.to_thread(vectors.getInfo)
    except Exception:
        water_geojson = {"type": "FeatureCollection", "features": []}

    previous_query = (
        select(
            resultado_espelho_agua_table.c.area_ha,
            resultado_espelho_agua_table.c.created_at,
        )
        .where(resultado_espelho_agua_table.c.reservoir_id == reservoir_id)
        .order_by(resultado_espelho_agua_table.c.created_at.desc())
        .limit(1)
    )
    with engine.connect() as connection:
        previous = connection.execute(previous_query).mappings().first()
    previous_area = float(previous["area_ha"]) if previous else None
    variation_pct = None
    if previous_area and previous_area > 0:
        variation_pct = ((area_val - previous_area) / previous_area) * 100.0

    visual_map = await asyncio.to_thread(water_mask_clean.visualize(min=0, max=1, palette=["1f78b4"]).getMapId)
    tile_url = visual_map["tile_fetcher"].url_format
    image_date_str = await asyncio.to_thread(ee.Date(image.get("system:time_start")).format("YYYY-MM-dd").getInfo)
    image_date = datetime.strptime(image_date_str, "%Y-%m-%d") if image_date_str else datetime.utcnow()

    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="espelho_agua",
        periodo_inicio=image_date,
        periodo_fim=image_date,
        parametros={
            "image_id": payload.imageId,
            "satellite": payload.satellite,
            "index_name": index_name,
            "threshold": payload.threshold,
        },
        resultado={
            "area_ha": area_val,
            "variacao_percentual": variation_pct,
        },
        duracao_ms=(datetime.utcnow() - started).total_seconds() * 1000.0,
    )

    geom_wkt = None
    if water_geojson.get("features"):
        try:
            geo_collection = {
                "type": "GeometryCollection",
                "geometries": [f["geometry"] for f in water_geojson.get("features", []) if f.get("geometry")],
            }
            geom_wkt = f"SRID=4326;{_geometry_to_shape(geo_collection).wkt}"
        except Exception:
            geom_wkt = None

    with engine.connect() as connection:
        tx = connection.begin()
        connection.execute(
            resultado_espelho_agua_table.insert().values(
                reservoir_id=reservoir_id,
                analysis_id=analysis_id,
                image_id=payload.imageId,
                indice_nome=index_name,
                threshold=payload.threshold,
                area_ha=area_val,
                variacao_percentual=variation_pct,
                geom=geom_wkt,
                metadados_json=_to_json_text({"tile_url": tile_url, "features": len(water_geojson.get("features", []))}),
                created_at=datetime.utcnow(),
            )
        )
        tx.commit()

    _persist_indicator(
        reservoir_id=reservoir_id,
        indicador_nome="water_area_ha",
        data_referencia=image_date,
        valor=area_val,
        unidade="ha",
        metadados={"analysis_id": analysis_id, "image_id": payload.imageId},
    )

    alert_id = None
    if variation_pct is not None and variation_pct <= -abs(payload.variation_alert_pct):
        severidade = "high" if variation_pct <= -30 else "medium"
        alert_id = _persist_alert(
            reservoir_id=reservoir_id,
            analysis_id=analysis_id,
            tipo_alerta="reducao_espelho_agua",
            severidade=severidade,
            mensagem=f"Reducao do espelho d'agua de {variation_pct:.2f}% acima do limiar configurado.",
            valor_metrica=variation_pct,
            valor_limiar=-abs(payload.variation_alert_pct),
            contexto={"area_ha_atual": area_val, "area_ha_anterior": previous_area},
        )

    return {
        "analysis_id": analysis_id,
        "image_id": payload.imageId,
        "index_name": index_name,
        "threshold": payload.threshold,
        "area_ha": round(area_val, 4),
        "previous_area_ha": previous_area,
        "variacao_percentual": round(variation_pct, 4) if variation_pct is not None else None,
        "tile_url": tile_url,
        "water_geojson": water_geojson,
        "alert_id": alert_id,
    }


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/timeseries", tags=["Reservoir Monitoring"])
async def run_reservoir_timeseries(reservoir_id: int, payload: ReservoirTimeSeriesRequest):
    _get_reservoir_row_or_404(reservoir_id)
    if payload.date_start >= payload.date_end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="date_start deve ser menor que date_end.")

    polygon = _resolve_monitoring_geometry(reservoir_id, payload.polygon)
    ee_geometry = create_ee_geometry_from_json(polygon)
    collection_name = SATELLITE_COLLECTIONS.get(payload.satellite)
    if not collection_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Satelite invalido para serie temporal.")
    if payload.satellite.upper().startswith("CBERS"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Serie temporal via modulo de reservatorios nao suporta CBERS.")

    is_landsat = payload.satellite.upper().startswith("LANDSAT")
    scale = 30 if is_landsat else 10
    image_collection = (
        ee.ImageCollection(collection_name)
        .filterBounds(ee_geometry)
        .filterDate(payload.date_start.isoformat(), payload.date_end.isoformat())
        .sort("system:time_start")
    )
    if payload.satellite.upper().startswith("SENTINEL"):
        image_collection = image_collection.filter(ee.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", 80))
    else:
        image_collection = image_collection.filter(ee.Filter.lte("CLOUD_COVER", 80))

    total_count = await asyncio.to_thread(image_collection.size().getInfo)
    if not total_count:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma imagem encontrada para a serie temporal.")

    total_count = int(total_count)
    step = max(1, total_count // payload.max_points)
    image_list = image_collection.toList(total_count)
    indicator = payload.indicator_name.upper()
    metric = payload.metric.lower()
    series: List[Dict[str, Any]] = []

    for idx in range(0, total_count, step):
        if len(series) >= payload.max_points:
            break
        image = ee.Image(image_list.get(idx))
        date_str = await asyncio.to_thread(ee.Date(image.get("system:time_start")).format("YYYY-MM-dd").getInfo)
        if not date_str:
            continue
        date_ref = datetime.strptime(date_str, "%Y-%m-%d")
        if metric == "water_area":
            threshold = payload.threshold if payload.threshold is not None else 0.05
            idx_map = calculate_indices_gee(image, is_landsat, [indicator])
            if indicator not in idx_map:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Indicador nao suportado: {indicator}")
            mask = idx_map[indicator].clip(ee_geometry).gt(threshold).selfMask()
            area_info = await asyncio.to_thread(
                mask.multiply(ee.Image.pixelArea())
                .reduceRegion(reducer=ee.Reducer.sum(), geometry=ee_geometry, scale=scale, maxPixels=1e10)
                .getInfo
            )
            first_value = next(iter(area_info.values())) if area_info else 0.0
            value = float(first_value or 0.0) / 10000.0
            unit = "ha"
            db_name = f"{indicator.lower()}_water_area_ha"
        else:
            idx_map = calculate_indices_gee(image, is_landsat, [indicator])
            if indicator not in idx_map:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Indicador nao suportado: {indicator}")
            reduce_dict = await asyncio.to_thread(
                idx_map[indicator]
                .clip(ee_geometry)
                .reduceRegion(reducer=ee.Reducer.mean(), geometry=ee_geometry, scale=scale, maxPixels=1e10)
                .getInfo
            )
            value = float(next(iter(reduce_dict.values())) if reduce_dict else 0.0)
            unit = "index"
            db_name = f"{indicator.lower()}_mean"

        series.append({"date": date_str, "value": value})
        _persist_indicator(
            reservoir_id=reservoir_id,
            indicador_nome=db_name,
            data_referencia=date_ref,
            valor=value,
            unidade=unit,
            metadados={"metric": metric, "indicator": indicator},
        )

    trend = "stable"
    if len(series) >= 2:
        delta = series[-1]["value"] - series[0]["value"]
        if delta > 0.02:
            trend = "up"
        elif delta < -0.02:
            trend = "down"

    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="serie_temporal",
        periodo_inicio=_date_to_datetime(payload.date_start),
        periodo_fim=_date_to_datetime(payload.date_end, end_of_day=True),
        parametros=payload.model_dump(),
        resultado={"series_count": len(series), "trend": trend},
    )
    return {
        "analysis_id": analysis_id,
        "reservoir_id": reservoir_id,
        "indicator_name": indicator,
        "metric": metric,
        "trend": trend,
        "series": series,
    }


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/landuse/classify", tags=["Reservoir Monitoring"])
async def classify_reservoir_landuse(reservoir_id: int, payload: ReservoirLandUseRequest):
    _get_reservoir_row_or_404(reservoir_id)
    polygon = _resolve_monitoring_geometry(reservoir_id, payload.polygon)
    ee_geometry = create_ee_geometry_from_json(polygon)

    image = ee.Image(payload.imageId)
    is_landsat = await _resolve_image_is_landsat(image, payload.imageId, payload.satellite)
    scale = 30 if is_landsat else 10
    scaled = get_image_bands(image, is_landsat)
    nir = scaled.select("SR_B5" if is_landsat else "B8")
    red = scaled.select("SR_B4" if is_landsat else "B4")
    green = scaled.select("SR_B3" if is_landsat else "B3")
    swir = scaled.select("SR_B6" if is_landsat else "B11")

    ndvi = scaled.expression("(NIR - RED) / (NIR + RED)", {"NIR": nir, "RED": red}).rename("NDVI")
    ndwi = scaled.expression("(GREEN - NIR) / (GREEN + NIR)", {"GREEN": green, "NIR": nir}).rename("NDWI")
    ndbi = scaled.expression("(SWIR - NIR) / (SWIR + NIR)", {"SWIR": swir, "NIR": nir}).rename("NDBI")

    water = ndwi.gt(0.1)
    vegetation = ndvi.gte(0.5).And(water.Not())
    soil = ndvi.lt(0.25).And(ndbi.lt(0.2)).And(water.Not())
    agriculture = ndvi.gte(0.25).And(ndvi.lt(0.5)).And(water.Not())
    anthropic = ndbi.gte(0.2).And(water.Not())

    classified = (
        ee.Image(6)
        .where(water, 1)
        .where(vegetation, 2)
        .where(soil, 3)
        .where(agriculture, 4)
        .where(anthropic, 5)
        .rename("lulc")
        .clip(ee_geometry)
    )

    classes = [
        {"id": 1, "name": "Agua", "color": "#2e86de"},
        {"id": 2, "name": "Vegetacao", "color": "#1f7a3e"},
        {"id": 3, "name": "Solo Exposto", "color": "#8d5524"},
        {"id": 4, "name": "Agricultura/Pastagem", "color": "#f4d03f"},
        {"id": 5, "name": "Area Antropica", "color": "#7f8c8d"},
        {"id": 6, "name": "Outros", "color": "#95a5a6"},
    ]
    stats = _compute_lulc_stats(classified, ee_geometry, classes, scale)
    palette = [c["color"].replace("#", "") for c in classes]
    map_id = await asyncio.to_thread(classified.visualize(min=1, max=6, palette=palette).getMapId)
    tile_url = map_id["tile_fetcher"].url_format
    classification_id = f"reservatorio-{reservoir_id}-{int(datetime.utcnow().timestamp())}"
    image_date_str = await asyncio.to_thread(ee.Date(image.get("system:time_start")).format("YYYY-MM-dd").getInfo)
    image_date = datetime.strptime(image_date_str, "%Y-%m-%d") if image_date_str else datetime.utcnow()

    previous_stats = None
    previous_query = (
        select(resultado_classificacao_uso_solo_table.c.estatisticas_json)
        .where(resultado_classificacao_uso_solo_table.c.reservoir_id == reservoir_id)
        .order_by(resultado_classificacao_uso_solo_table.c.created_at.desc())
        .limit(1)
    )
    with engine.connect() as connection:
        prev_row = connection.execute(previous_query).mappings().first()
    if prev_row:
        previous_stats = _from_json_text(prev_row.get("estatisticas_json"), [])
    previous_by_class = {item.get("class_name"): float(item.get("area_ha", 0.0)) for item in (previous_stats or [])}
    current_by_class = {item["class_name"]: float(item["area_ha"]) for item in stats}

    def _delta_pct(class_name: str) -> Optional[float]:
        if class_name not in previous_by_class:
            return None
        prev = previous_by_class[class_name]
        if prev <= 0:
            return None
        return ((current_by_class.get(class_name, 0.0) - prev) / prev) * 100.0

    soil_delta_pct = _delta_pct("Solo Exposto")
    anth_delta_pct = _delta_pct("Area Antropica")

    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="classificacao_uso_solo",
        periodo_inicio=image_date,
        periodo_fim=image_date,
        parametros=payload.model_dump(),
        resultado={
            "classification_id": classification_id,
            "stats": stats,
            "soil_delta_pct": soil_delta_pct,
            "anthropic_delta_pct": anth_delta_pct,
        },
    )

    with engine.connect() as connection:
        tx = connection.begin()
        connection.execute(
            resultado_classificacao_uso_solo_table.insert().values(
                reservoir_id=reservoir_id,
                analysis_id=analysis_id,
                classification_id=classification_id,
                tile_url=tile_url,
                estatisticas_json=_to_json_text(stats),
                legenda_json=_to_json_text(classes),
                periodo_inicio=image_date,
                periodo_fim=image_date,
                created_at=datetime.utcnow(),
            )
        )
        tx.commit()

    if soil_delta_pct is not None and soil_delta_pct >= abs(payload.soil_exposed_alert_pct):
        _persist_alert(
            reservoir_id=reservoir_id,
            analysis_id=analysis_id,
            tipo_alerta="aumento_solo_exposto",
            severidade="medium" if soil_delta_pct < 25 else "high",
            mensagem=f"Aumento de solo exposto em {soil_delta_pct:.2f}% no entorno monitorado.",
            valor_metrica=soil_delta_pct,
            valor_limiar=abs(payload.soil_exposed_alert_pct),
            contexto={"classe": "Solo Exposto"},
        )
    if anth_delta_pct is not None and anth_delta_pct >= abs(payload.anthropic_alert_pct):
        _persist_alert(
            reservoir_id=reservoir_id,
            analysis_id=analysis_id,
            tipo_alerta="expansao_area_antropica",
            severidade="medium" if anth_delta_pct < 20 else "high",
            mensagem=f"Expansao de area antropica em {anth_delta_pct:.2f}% no entorno do reservatorio.",
            valor_metrica=anth_delta_pct,
            valor_limiar=abs(payload.anthropic_alert_pct),
            contexto={"classe": "Area Antropica"},
        )

    return {
        "analysis_id": analysis_id,
        "classification_id": classification_id,
        "tile_url": tile_url,
        "legend": classes,
        "class_stats": stats,
        "comparison": {
            "soil_exposed_delta_pct": soil_delta_pct,
            "anthropic_delta_pct": anth_delta_pct,
        },
    }


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/change-detection", tags=["Reservoir Monitoring"])
async def detect_reservoir_change(reservoir_id: int, payload: ReservoirChangeRequest):
    _get_reservoir_row_or_404(reservoir_id)
    polygon = _resolve_monitoring_geometry(reservoir_id, payload.polygon)
    response = await detect_changes(
        ChangeDetectionRequest(
            beforeImageId=payload.beforeImageId,
            afterImageId=payload.afterImageId,
            satellite=payload.satellite,
            polygon=polygon,
            threshold=payload.threshold,
        )
    )

    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="deteccao_mudanca",
        periodo_inicio=None,
        periodo_fim=None,
        parametros=payload.model_dump(),
        resultado={
            "gain_area_ha": response.gainAreaHa,
            "loss_area_ha": response.lossAreaHa,
            "total_area_ha": response.totalAreaHa,
        },
    )

    with engine.connect() as connection:
        tx = connection.begin()
        connection.execute(
            resultado_deteccao_mudanca_table.insert().values(
                reservoir_id=reservoir_id,
                analysis_id=analysis_id,
                before_image_id=payload.beforeImageId,
                after_image_id=payload.afterImageId,
                gain_area_ha=response.gainAreaHa,
                loss_area_ha=response.lossAreaHa,
                total_area_ha=response.totalAreaHa,
                change_geojson=_to_json_text(response.changeGeoJson),
                difference_tile_url=response.differenceImageUrl,
                created_at=datetime.utcnow(),
            )
        )
        tx.commit()

    alert_id = None
    if float(response.lossAreaHa or 0.0) >= payload.loss_alert_ha:
        alert_id = _persist_alert(
            reservoir_id=reservoir_id,
            analysis_id=analysis_id,
            tipo_alerta="perda_cobertura_vegetal",
            severidade="medium" if response.lossAreaHa < 20 else "high",
            mensagem=f"Perda de cobertura detectada ({response.lossAreaHa:.2f} ha).",
            valor_metrica=float(response.lossAreaHa),
            valor_limiar=payload.loss_alert_ha,
            contexto={"gain_area_ha": response.gainAreaHa, "total_area_ha": response.totalAreaHa},
        )

    return {
        "analysis_id": analysis_id,
        "alert_id": alert_id,
        "changeGeoJson": response.changeGeoJson,
        "differenceImageUrl": response.differenceImageUrl,
        "gainAreaHa": response.gainAreaHa,
        "lossAreaHa": response.lossAreaHa,
        "totalAreaHa": response.totalAreaHa,
    }


def _resolve_app_geometry(reservoir_id: int, app_geometry: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if app_geometry:
        return app_geometry
    ctx_query = select(ST_AsGeoJSON(reservatorio_contexto_table.c.geom_app).label("geom_app")).where(
        reservatorio_contexto_table.c.reservoir_id == reservoir_id
    )
    with engine.connect() as connection:
        row = connection.execute(ctx_query).mappings().first()
    if row and row.get("geom_app"):
        return json.loads(row["geom_app"])
    app_query = (
        select(ST_AsGeoJSON(reservatorio_app_table.c.geom).label("geom_app"))
        .where(reservatorio_app_table.c.reservoir_id == reservoir_id)
        .order_by(reservatorio_app_table.c.created_at.desc())
        .limit(1)
    )
    with engine.connect() as connection:
        app_row = connection.execute(app_query).mappings().first()
    if app_row and app_row.get("geom_app"):
        return json.loads(app_row["geom_app"])
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="APP/faixa marginal nao definida para o reservatorio.")


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/riparian/monitor", tags=["Reservoir Monitoring"])
async def monitor_riparian_vegetation(reservoir_id: int, payload: ReservoirRiparianRequest):
    _get_reservoir_row_or_404(reservoir_id)
    app_geometry = _resolve_app_geometry(reservoir_id, payload.app_geometry)
    ee_geometry = create_ee_geometry_from_json(app_geometry)
    image = ee.Image(payload.imageId)
    is_landsat = await _resolve_image_is_landsat(image, payload.imageId, payload.satellite)
    scale = 30 if is_landsat else 10
    ndvi_map = calculate_indices_gee(image, is_landsat, ["NDVI"])
    ndvi_img = ndvi_map["NDVI"].clip(ee_geometry)
    reduce_info = await asyncio.to_thread(
        ndvi_img.reduceRegion(reducer=ee.Reducer.mean(), geometry=ee_geometry, scale=scale, maxPixels=1e10).getInfo
    )
    ndvi_mean = float(next(iter(reduce_info.values())) if reduce_info else 0.0)
    image_date_str = await asyncio.to_thread(ee.Date(image.get("system:time_start")).format("YYYY-MM-dd").getInfo)
    image_date = datetime.strptime(image_date_str, "%Y-%m-%d") if image_date_str else datetime.utcnow()

    previous = _get_latest_indicator(reservoir_id, "riparian_ndvi_mean")
    previous_value = float(previous["valor"]) if previous else None
    variation_pct = None
    if previous_value is not None and previous_value != 0:
        variation_pct = ((ndvi_mean - previous_value) / previous_value) * 100.0

    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="monitoramento_app",
        periodo_inicio=image_date,
        periodo_fim=image_date,
        parametros=payload.model_dump(),
        resultado={"ndvi_mean": ndvi_mean, "variacao_pct": variation_pct},
    )
    _persist_indicator(
        reservoir_id=reservoir_id,
        indicador_nome="riparian_ndvi_mean",
        data_referencia=image_date,
        valor=ndvi_mean,
        unidade="index",
        metadados={"analysis_id": analysis_id, "image_id": payload.imageId, "variacao_pct": variation_pct},
    )

    alert_id = None
    if variation_pct is not None and variation_pct <= -abs(payload.ndvi_drop_alert_pct):
        alert_id = _persist_alert(
            reservoir_id=reservoir_id,
            analysis_id=analysis_id,
            tipo_alerta="queda_ndvi_app",
            severidade="medium" if variation_pct > -30 else "high",
            mensagem=f"Queda de NDVI na APP de {variation_pct:.2f}% no periodo analisado.",
            valor_metrica=variation_pct,
            valor_limiar=-abs(payload.ndvi_drop_alert_pct),
            contexto={"ndvi_atual": ndvi_mean, "ndvi_anterior": previous_value},
        )

    return {
        "analysis_id": analysis_id,
        "image_date": image_date_str,
        "ndvi_mean": ndvi_mean,
        "previous_ndvi_mean": previous_value,
        "variacao_pct": variation_pct,
        "alert_id": alert_id,
    }


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/proxies/turbidity", tags=["Reservoir Monitoring"])
async def compute_reservoir_turbidity_proxy(reservoir_id: int, payload: ReservoirTurbidityRequest):
    _get_reservoir_row_or_404(reservoir_id)
    polygon = _resolve_monitoring_geometry(reservoir_id, payload.polygon)
    ee_geometry = create_ee_geometry_from_json(polygon)
    image = ee.Image(payload.imageId)
    is_landsat = await _resolve_image_is_landsat(image, payload.imageId, payload.satellite)
    scale = 30 if is_landsat else 10
    scaled = get_image_bands(image, is_landsat)
    red = scaled.select("SR_B4" if is_landsat else "B4")
    green = scaled.select("SR_B3" if is_landsat else "B3")
    nir = scaled.select("SR_B5" if is_landsat else "B8")

    ndwi = scaled.expression("(GREEN - NIR) / (GREEN + NIR)", {"GREEN": green, "NIR": nir}).rename("NDWI")
    water_mask = ndwi.gt(0.05).selfMask()
    ndti = scaled.expression("(RED - GREEN) / (RED + GREEN)", {"RED": red, "GREEN": green}).rename("NDTI")
    ndti_water = ndti.updateMask(water_mask).clip(ee_geometry)

    stats = await asyncio.to_thread(
        ndti_water.reduceRegion(
            reducer=ee.Reducer.minMax().combine(reducer2=ee.Reducer.mean(), sharedInputs=True),
            geometry=ee_geometry,
            scale=scale,
            maxPixels=1e10,
        ).getInfo
    )
    numeric = _extract_numeric_stats(stats or {}, "NDTI")
    image_date_str = await asyncio.to_thread(ee.Date(image.get("system:time_start")).format("YYYY-MM-dd").getInfo)
    image_date = datetime.strptime(image_date_str, "%Y-%m-%d") if image_date_str else datetime.utcnow()
    mean_val = float(numeric.get("mean") or 0.0)

    analysis_id = _persist_analysis(
        reservoir_id=reservoir_id,
        tipo_analise="proxy_turbidez",
        periodo_inicio=image_date,
        periodo_fim=image_date,
        parametros=payload.model_dump(),
        resultado={"ndti_stats": numeric},
    )
    _persist_indicator(
        reservoir_id=reservoir_id,
        indicador_nome="turbidity_proxy_ndti",
        data_referencia=image_date,
        valor=mean_val,
        unidade="index",
        metadados={"analysis_id": analysis_id, "image_id": payload.imageId},
    )

    alert_id = None
    if mean_val >= payload.threshold:
        alert_id = _persist_alert(
            reservoir_id=reservoir_id,
            analysis_id=analysis_id,
            tipo_alerta="aumento_proxy_turbidez",
            severidade="medium" if mean_val < (payload.threshold * 1.5) else "high",
            mensagem=f"Proxy de turbidez acima do limiar: {mean_val:.4f}.",
            valor_metrica=mean_val,
            valor_limiar=payload.threshold,
            contexto=numeric,
        )

    return {
        "analysis_id": analysis_id,
        "image_date": image_date_str,
        "indicator": "NDTI",
        "stats": numeric,
        "alert_id": alert_id,
    }


@app.get("/api/reservoir-monitoring/reservoirs/{reservoir_id}/waterbody/history", tags=["Reservoir Monitoring"])
async def get_waterbody_history(reservoir_id: int, limit: int = 36):
    _get_reservoir_row_or_404(reservoir_id)
    query = (
        select(
            resultado_espelho_agua_table.c.id,
            resultado_espelho_agua_table.c.image_id,
            resultado_espelho_agua_table.c.indice_nome,
            resultado_espelho_agua_table.c.threshold,
            resultado_espelho_agua_table.c.area_ha,
            resultado_espelho_agua_table.c.variacao_percentual,
            resultado_espelho_agua_table.c.created_at,
            resultado_espelho_agua_table.c.metadados_json,
        )
        .where(resultado_espelho_agua_table.c.reservoir_id == reservoir_id)
        .order_by(resultado_espelho_agua_table.c.created_at.desc())
        .limit(max(1, min(200, limit)))
    )
    with engine.connect() as connection:
        rows = connection.execute(query).mappings().all()
    items = []
    for row in rows:
        items.append(
            {
                "id": int(row["id"]),
                "image_id": row["image_id"],
                "indice_nome": row["indice_nome"],
                "threshold": float(row["threshold"]),
                "area_ha": float(row["area_ha"]),
                "variacao_percentual": float(row["variacao_percentual"]) if row["variacao_percentual"] is not None else None,
                "created_at": row["created_at"].isoformat() + "Z" if row["created_at"] else None,
                "metadados": _from_json_text(row.get("metadados_json"), {}),
            }
        )
    return {"reservoir_id": reservoir_id, "items": items}


@app.get("/api/reservoir-monitoring/reservoirs/{reservoir_id}/alerts", tags=["Reservoir Monitoring"])
async def list_reservoir_alerts(reservoir_id: int, status_filter: Optional[str] = None, limit: int = 100):
    _get_reservoir_row_or_404(reservoir_id)
    query = select(
        alerta_reservatorio_table.c.id,
        alerta_reservatorio_table.c.analysis_id,
        alerta_reservatorio_table.c.tipo_alerta,
        alerta_reservatorio_table.c.severidade,
        alerta_reservatorio_table.c.mensagem,
        alerta_reservatorio_table.c.valor_metrica,
        alerta_reservatorio_table.c.valor_limiar,
        alerta_reservatorio_table.c.status,
        alerta_reservatorio_table.c.contexto_json,
        alerta_reservatorio_table.c.data_alerta,
    ).where(alerta_reservatorio_table.c.reservoir_id == reservoir_id)
    if status_filter:
        query = query.where(alerta_reservatorio_table.c.status == status_filter)
    query = query.order_by(alerta_reservatorio_table.c.data_alerta.desc()).limit(max(1, min(limit, 300)))
    with engine.connect() as connection:
        rows = connection.execute(query).mappings().all()
    return {
        "reservoir_id": reservoir_id,
        "items": [
            {
                "id": int(row["id"]),
                "analysis_id": int(row["analysis_id"]) if row["analysis_id"] is not None else None,
                "tipo_alerta": row["tipo_alerta"],
                "severidade": row["severidade"],
                "mensagem": row["mensagem"],
                "valor_metrica": float(row["valor_metrica"]) if row["valor_metrica"] is not None else None,
                "valor_limiar": float(row["valor_limiar"]) if row["valor_limiar"] is not None else None,
                "status": row["status"],
                "contexto": _from_json_text(row.get("contexto_json"), {}),
                "data_alerta": row["data_alerta"].isoformat() + "Z" if row["data_alerta"] else None,
            }
            for row in rows
        ],
    }


@app.patch("/api/reservoir-monitoring/alerts/{alert_id}", tags=["Reservoir Monitoring"])
async def update_reservoir_alert_status(alert_id: int, payload: ReservoirAlertStatusUpdate):
    update_query = (
        alerta_reservatorio_table.update()
        .where(alerta_reservatorio_table.c.id == alert_id)
        .values(status=payload.status)
    )
    with engine.connect() as connection:
        tx = connection.begin()
        result = connection.execute(update_query)
        tx.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta nao encontrado.")
    return {"id": alert_id, "status": payload.status}


@app.get("/api/reservoir-monitoring/reservoirs/{reservoir_id}/history", tags=["Reservoir Monitoring"])
async def list_reservoir_analysis_history(reservoir_id: int, analysis_type: Optional[str] = None, limit: int = 80):
    _get_reservoir_row_or_404(reservoir_id)
    query = select(
        analise_reservatorio_table.c.id,
        analise_reservatorio_table.c.tipo_analise,
        analise_reservatorio_table.c.periodo_inicio,
        analise_reservatorio_table.c.periodo_fim,
        analise_reservatorio_table.c.status,
        analise_reservatorio_table.c.origem_dados,
        analise_reservatorio_table.c.duracao_ms,
        analise_reservatorio_table.c.parametros_json,
        analise_reservatorio_table.c.resultado_json,
        analise_reservatorio_table.c.created_at,
    ).where(analise_reservatorio_table.c.reservoir_id == reservoir_id)
    if analysis_type:
        query = query.where(analise_reservatorio_table.c.tipo_analise == analysis_type)
    query = query.order_by(analise_reservatorio_table.c.created_at.desc()).limit(max(1, min(limit, 400)))
    with engine.connect() as connection:
        rows = connection.execute(query).mappings().all()
    items = []
    for row in rows:
        items.append(
            {
                "id": int(row["id"]),
                "tipo_analise": row["tipo_analise"],
                "periodo_inicio": row["periodo_inicio"].isoformat() + "Z" if row["periodo_inicio"] else None,
                "periodo_fim": row["periodo_fim"].isoformat() + "Z" if row["periodo_fim"] else None,
                "status": row["status"],
                "origem_dados": row["origem_dados"],
                "duracao_ms": float(row["duracao_ms"]) if row["duracao_ms"] is not None else None,
                "parametros": _from_json_text(row.get("parametros_json"), {}),
                "resultado": _from_json_text(row.get("resultado_json"), {}),
                "created_at": row["created_at"].isoformat() + "Z" if row["created_at"] else None,
            }
        )
    return {"reservoir_id": reservoir_id, "items": items}


@app.post("/api/reservoir-monitoring/reservoirs/{reservoir_id}/ai-insights", tags=["Reservoir Monitoring"])
async def generate_reservoir_ai_insight(reservoir_id: int, payload: ReservoirAiInsightRequest):
    reservoir = _get_reservoir_row_or_404(reservoir_id)
    period_start = _date_to_datetime(payload.periodo_inicio) if payload.periodo_inicio else None
    period_end = _date_to_datetime(payload.periodo_fim, end_of_day=True) if payload.periodo_fim else None

    analyses_query = (
        select(
            analise_reservatorio_table.c.id,
            analise_reservatorio_table.c.tipo_analise,
            analise_reservatorio_table.c.resultado_json,
            analise_reservatorio_table.c.created_at,
        )
        .where(analise_reservatorio_table.c.reservoir_id == reservoir_id)
        .order_by(analise_reservatorio_table.c.created_at.desc())
        .limit(payload.limite_analises)
    )
    alerts_query = (
        select(
            alerta_reservatorio_table.c.id,
            alerta_reservatorio_table.c.tipo_alerta,
            alerta_reservatorio_table.c.severidade,
            alerta_reservatorio_table.c.mensagem,
            alerta_reservatorio_table.c.status,
            alerta_reservatorio_table.c.data_alerta,
        )
        .where(
            alerta_reservatorio_table.c.reservoir_id == reservoir_id,
            alerta_reservatorio_table.c.status == "active",
        )
        .order_by(alerta_reservatorio_table.c.data_alerta.desc())
        .limit(20)
    )
    latest_water_query = (
        select(
            resultado_espelho_agua_table.c.area_ha,
            resultado_espelho_agua_table.c.variacao_percentual,
            resultado_espelho_agua_table.c.created_at,
        )
        .where(resultado_espelho_agua_table.c.reservoir_id == reservoir_id)
        .order_by(resultado_espelho_agua_table.c.created_at.desc())
        .limit(1)
    )
    latest_riparian = _get_latest_indicator(reservoir_id, "riparian_ndvi_mean")
    latest_turbidity = _get_latest_indicator(reservoir_id, "turbidity_proxy_ndti")

    with engine.connect() as connection:
        analyses_rows = connection.execute(analyses_query).mappings().all()
        alert_rows = connection.execute(alerts_query).mappings().all()
        water_row = connection.execute(latest_water_query).mappings().first()

    payload_data = {
        "reservatorio": {"id": reservoir_id, "nome": reservoir["name"]},
        "periodo": {
            "inicio": period_start.isoformat() + "Z" if period_start else None,
            "fim": period_end.isoformat() + "Z" if period_end else None,
        },
        "analises_recentes": [
            {
                "id": int(row["id"]),
                "tipo": row["tipo_analise"],
                "resultado": _from_json_text(row.get("resultado_json"), {}),
                "created_at": row["created_at"].isoformat() + "Z" if row["created_at"] else None,
            }
            for row in analyses_rows
        ],
        "alerts": [
            {
                "id": int(row["id"]),
                "tipo_alerta": row["tipo_alerta"],
                "severidade": row["severidade"],
                "mensagem": row["mensagem"],
                "status": row["status"],
                "data_alerta": row["data_alerta"].isoformat() + "Z" if row["data_alerta"] else None,
            }
            for row in alert_rows
        ],
        "latest_water": {
            "area_ha": float(water_row["area_ha"]),
            "variacao_percentual": float(water_row["variacao_percentual"]) if water_row and water_row["variacao_percentual"] is not None else None,
            "data": water_row["created_at"].isoformat() + "Z" if water_row and water_row["created_at"] else None,
        }
        if water_row
        else None,
        "latest_riparian": {
            "valor": float(latest_riparian["valor"]),
            "data": latest_riparian["data_referencia"].isoformat() + "Z" if latest_riparian and latest_riparian.get("data_referencia") else None,
            "variacao_pct": latest_riparian.get("metadados", {}).get("variacao_pct"),
        }
        if latest_riparian
        else None,
        "latest_turbidity": {
            "valor": float(latest_turbidity["valor"]),
            "data": latest_turbidity["data_referencia"].isoformat() + "Z" if latest_turbidity and latest_turbidity.get("data_referencia") else None,
        }
        if latest_turbidity
        else None,
    }

    heuristic_insight = _build_reservoir_ai_heuristic(payload_data)
    insight = _call_llm_reservoir_insight(payload_data, heuristic_insight)
    text_output = (
        f"{insight['resumo_executivo']} "
        f"Recomendacoes: {insight['recomendacoes']} "
        f"Limitacoes: {insight['limitacoes']}"
    ).strip()
    _log_event(
        "reservoir_ai_insight_generated",
        reservoir_id=reservoir_id,
        source=insight.get("source", "heuristic"),
        confidence=insight.get("confianca"),
    )
    insert_query = insight_ia_reservatorio_table.insert().values(
        reservoir_id=reservoir_id,
        analysis_id=None,
        periodo_inicio=period_start,
        periodo_fim=period_end,
        prompt_json=_to_json_text(
            {
                "input": payload_data,
                "source": insight.get("source", "heuristic"),
                "model": insight.get("model"),
            }
        ),
        insight_texto=text_output,
        confianca=insight.get("confianca"),
        limitacoes=insight.get("limitacoes"),
        created_at=datetime.utcnow(),
    ).returning(insight_ia_reservatorio_table.c.id)
    with engine.connect() as connection:
        tx = connection.begin()
        row = connection.execute(insert_query).mappings().first()
        tx.commit()
    return {
        "id": int(row["id"]),
        "reservoir_id": reservoir_id,
        "insight": insight,
        "texto": text_output,
        "source": insight.get("source", "heuristic"),
    }


@app.get("/api/reservoir-monitoring/dashboard", tags=["Reservoir Monitoring"])
async def get_reservoir_monitoring_dashboard():
    with engine.connect() as connection:
        total_reservoirs = connection.execute(select(func.count()).select_from(reservoirs_table)).scalar_one()
        monitored_reservoirs = connection.execute(
            select(func.count()).select_from(reservatorio_contexto_table).where(reservatorio_contexto_table.c.status_monitoramento == "active")
        ).scalar_one()
        active_alerts = connection.execute(
            select(func.count()).select_from(alerta_reservatorio_table).where(alerta_reservatorio_table.c.status == "active")
        ).scalar_one()
        water_rows = connection.execute(
            select(
                resultado_espelho_agua_table.c.reservoir_id,
                resultado_espelho_agua_table.c.variacao_percentual,
                resultado_espelho_agua_table.c.created_at,
            )
            .where(resultado_espelho_agua_table.c.variacao_percentual.is_not(None))
            .order_by(resultado_espelho_agua_table.c.created_at.desc())
        ).mappings().all()
        alerts_by_severity = connection.execute(
            select(alerta_reservatorio_table.c.severidade, func.count().label("qtd"))
            .where(alerta_reservatorio_table.c.status == "active")
            .group_by(alerta_reservatorio_table.c.severidade)
        ).mappings().all()
        ranking_rows = connection.execute(
            select(
                alerta_reservatorio_table.c.reservoir_id,
                func.count().label("active_alerts"),
            )
            .where(alerta_reservatorio_table.c.status == "active")
            .group_by(alerta_reservatorio_table.c.reservoir_id)
            .order_by(func.count().desc())
            .limit(10)
        ).mappings().all()
    avg_variation = 0.0
    if water_rows:
        values = [float(r["variacao_percentual"]) for r in water_rows if r["variacao_percentual"] is not None]
        avg_variation = float(sum(values) / len(values)) if values else 0.0

    reservoir_name_by_id: Dict[int, str] = {}
    if ranking_rows:
        ids = [int(r["reservoir_id"]) for r in ranking_rows]
        with engine.connect() as connection:
            rows = connection.execute(
                select(reservoirs_table.c.id, reservoirs_table.c.name).where(reservoirs_table.c.id.in_(ids))
            ).mappings().all()
        reservoir_name_by_id = {int(r["id"]): r["name"] for r in rows}

    ranking = [
        {
            "reservoir_id": int(row["reservoir_id"]),
            "reservatorio_nome": reservoir_name_by_id.get(int(row["reservoir_id"]), f"Reservatorio {int(row['reservoir_id'])}"),
            "active_alerts": int(row["active_alerts"]),
        }
        for row in ranking_rows
    ]

    return {
        "total_reservatorios_monitorados": int(total_reservoirs),
        "reservatorios_ativos_monitoramento": int(monitored_reservoirs),
        "alertas_ativos": int(active_alerts),
        "variacao_media_area_alagada_pct": round(avg_variation, 4),
        "ocorrencias_por_severidade": [{"severidade": row["severidade"], "qtd": int(row["qtd"])} for row in alerts_by_severity],
        "ranking_criticidade": ranking,
    }


@app.get("/api/reservoir-monitoring/reservoirs/{reservoir_id}/report", tags=["Reservoir Monitoring"])
async def export_reservoir_report(
    reservoir_id: int,
    date_start: Optional[date] = None,
    date_end: Optional[date] = None,
    export_format: str = "json",
):
    reservoir = _get_reservoir_row_or_404(reservoir_id)
    start_dt = _date_to_datetime(date_start) if date_start else None
    end_dt = _date_to_datetime(date_end, end_of_day=True) if date_end else None

    analyses_query = select(
        analise_reservatorio_table.c.id,
        analise_reservatorio_table.c.tipo_analise,
        analise_reservatorio_table.c.periodo_inicio,
        analise_reservatorio_table.c.periodo_fim,
        analise_reservatorio_table.c.resultado_json,
        analise_reservatorio_table.c.created_at,
    ).where(analise_reservatorio_table.c.reservoir_id == reservoir_id)
    indicators_query = select(
        serie_temporal_indicador_table.c.indicador_nome,
        serie_temporal_indicador_table.c.data_referencia,
        serie_temporal_indicador_table.c.valor,
        serie_temporal_indicador_table.c.unidade,
    ).where(serie_temporal_indicador_table.c.reservoir_id == reservoir_id)
    alerts_query = select(
        alerta_reservatorio_table.c.tipo_alerta,
        alerta_reservatorio_table.c.severidade,
        alerta_reservatorio_table.c.mensagem,
        alerta_reservatorio_table.c.status,
        alerta_reservatorio_table.c.data_alerta,
    ).where(alerta_reservatorio_table.c.reservoir_id == reservoir_id)

    if start_dt:
        analyses_query = analyses_query.where(analise_reservatorio_table.c.created_at >= start_dt)
        indicators_query = indicators_query.where(serie_temporal_indicador_table.c.data_referencia >= start_dt)
        alerts_query = alerts_query.where(alerta_reservatorio_table.c.data_alerta >= start_dt)
    if end_dt:
        analyses_query = analyses_query.where(analise_reservatorio_table.c.created_at <= end_dt)
        indicators_query = indicators_query.where(serie_temporal_indicador_table.c.data_referencia <= end_dt)
        alerts_query = alerts_query.where(alerta_reservatorio_table.c.data_alerta <= end_dt)

    analyses_query = analyses_query.order_by(analise_reservatorio_table.c.created_at.desc()).limit(500)
    indicators_query = indicators_query.order_by(serie_temporal_indicador_table.c.data_referencia.desc()).limit(2000)
    alerts_query = alerts_query.order_by(alerta_reservatorio_table.c.data_alerta.desc()).limit(500)

    with engine.connect() as connection:
        analyses_rows = connection.execute(analyses_query).mappings().all()
        indicator_rows = connection.execute(indicators_query).mappings().all()
        alert_rows = connection.execute(alerts_query).mappings().all()
        insight_row = connection.execute(
            select(
                insight_ia_reservatorio_table.c.insight_texto,
                insight_ia_reservatorio_table.c.confianca,
                insight_ia_reservatorio_table.c.limitacoes,
                insight_ia_reservatorio_table.c.created_at,
            )
            .where(insight_ia_reservatorio_table.c.reservoir_id == reservoir_id)
            .order_by(insight_ia_reservatorio_table.c.created_at.desc())
            .limit(1)
        ).mappings().first()

    report_payload = {
        "reservatorio": {"id": reservoir_id, "nome": reservoir["name"], "descricao": reservoir.get("description")},
        "periodo": {
            "inicio": start_dt.isoformat() + "Z" if start_dt else None,
            "fim": end_dt.isoformat() + "Z" if end_dt else None,
        },
        "analises": [
            {
                "id": int(row["id"]),
                "tipo_analise": row["tipo_analise"],
                "periodo_inicio": row["periodo_inicio"].isoformat() + "Z" if row["periodo_inicio"] else None,
                "periodo_fim": row["periodo_fim"].isoformat() + "Z" if row["periodo_fim"] else None,
                "resultado": _from_json_text(row.get("resultado_json"), {}),
                "created_at": row["created_at"].isoformat() + "Z" if row["created_at"] else None,
            }
            for row in analyses_rows
        ],
        "indicadores": [
            {
                "indicador_nome": row["indicador_nome"],
                "data_referencia": row["data_referencia"].isoformat() + "Z" if row["data_referencia"] else None,
                "valor": float(row["valor"]),
                "unidade": row["unidade"],
            }
            for row in indicator_rows
        ],
        "alertas": [
            {
                "tipo_alerta": row["tipo_alerta"],
                "severidade": row["severidade"],
                "mensagem": row["mensagem"],
                "status": row["status"],
                "data_alerta": row["data_alerta"].isoformat() + "Z" if row["data_alerta"] else None,
            }
            for row in alert_rows
        ],
        "insight_ia": {
            "texto": insight_row["insight_texto"] if insight_row else None,
            "confianca": insight_row["confianca"] if insight_row else None,
            "limitacoes": insight_row["limitacoes"] if insight_row else None,
            "created_at": insight_row["created_at"].isoformat() + "Z" if insight_row and insight_row.get("created_at") else None,
        },
    }

    if export_format.lower() == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["indicador_nome", "data_referencia", "valor", "unidade"])
        for row in report_payload["indicadores"]:
            writer.writerow([row["indicador_nome"], row["data_referencia"], row["valor"], row["unidade"]])
        csv_text = output.getvalue()
        output.close()
        return Response(
            content=csv_text,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=reservatorio_{reservoir_id}_indicadores.csv"
            },
        )

    return report_payload


