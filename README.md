# WebGIS MVP

Plataforma WebGIS para monitoramento territorial e ambiental com:
- frontend React + Leaflet
- backend FastAPI + Google Earth Engine
- foco em analise temporal e comparacao de camadas raster

## Versao

- Versao atual: `1.1.0`
- Tag consolidada: `v1.1.0-mvp-consolidado`

## Capacidades principais

1. Desenho de AOI (Area of Interest) no mapa
2. Busca de imagens de satelite (Landsat, Sentinel e CBERS em fluxos suportados)
3. Selecao de imagens no carrossel temporal
4. Swipe de comparacao com divisor arrastavel
5. Calculo de indices espectrais:
   - NDVI
   - SAVI
   - MSAVI
   - SR
   - Green NDVI
   - Red-Edge NDVI
   - VARI
   - TSAVI
6. Deteccao de mudancas (ganho/perda)
7. Graficos e estatisticas
8. Modulo de classificacao de uso e cobertura do solo (LULC)

## Swipe avancado (camadas comparaveis)

O swipe suporta comparacao entre tipos de camada:

- Imagem vs Imagem
- Imagem vs Indice
- Imagem vs Mudanca
- Indice vs Indice
- Mudanca vs Indice
- Mudanca vs Mudanca

### Como funciona

- O frontend monta uma lista unificada de camadas comparaveis via utilitario `getAvailableSwipeLayers()`.
- Cada camada possui metadados para o painel de comparacao:
  - `id`
  - `label`
  - `kind` (`tile` ou `imageOverlay`)
  - `layerType` (`imagery`, `indices`, `changeDetection`)
  - `date` (quando aplicavel)
  - `indexType` (quando aplicavel)

O painel de swipe permite escolher, para cada lado:
- tipo da camada
- camada especifica do tipo selecionado

## Arquitetura

### Frontend

- React 19
- TypeScript
- Vite
- Leaflet + React-Leaflet
- Modulos relevantes:
  - `src/components/MapView.tsx`
  - `src/modules/swipe/*`
  - `src/modules/landcover/*`
  - `src/components/ImageCarousel.tsx`

### Backend

- FastAPI
- Earth Engine Python API
- SQLAlchemy + GeoAlchemy2 + PostGIS
- Modulos relevantes:
  - `backend/main.py`
  - `backend/routers/landcover.py`
  - `backend/services/landcover_service.py`

## Fluxo resumido

1. Usuario define AOI
2. Backend consulta colecoes (Earth Engine / STAC suportado)
3. Frontend renderiza camadas raster
4. Usuario compara camadas no swipe e executa analises (indices, mudanca, LULC)

## Requisitos

- Node.js 20+
- Python 3.10+
- PostgreSQL 14+ com PostGIS
- Projeto Google Cloud com acesso ao Earth Engine
- Credenciais de service account para EE

## Variaveis de ambiente

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/webgis
EE_CREDENTIALS_PATH=C:\\RKSISTEMAS\\DEV\\MVP\\webgis-mvp\\backend\\credentials\\credentials.json
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8000
VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

## Execucao local

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Swagger: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

## Endpoints principais

### Earth Engine

- `POST /api/earth-images/search`
- `POST /api/earth-images/preview`
- `POST /api/earth-images/indices`
- `POST /api/earth-images/change-detection`
- `POST /api/earth-images/refine-classification`
- `POST /api/earth-images/download-info`
- `GET /api/earth-images/precipitation-tiles`

### LandCover

- `POST /analysis/landcover/classify`
- `GET /analysis/landcover/stats`

### Agronomo virtual

- `POST /api/agronomo/relatorio`
- `GET /api/agronomo/relatorios`
- `GET /api/agronomo/relatorio/{report_id}/comparar-anterior`

## Testes

### Backend

```bash
python -m pytest backend/tests -q
```

### Testes manuais recomendados (Swipe)

1. Imagem vs Imagem
2. Imagem vs NDVI
3. NDVI vs NDVI
4. Imagem vs Mudanca
5. Mudanca vs NDVI
6. Mudanca vs Mudanca

Validar:
- arraste do divisor
- reset 50%
- inverter camadas
- trocar tipo/camada sem quebrar mapa
- manter AOI, carrossel e paineis funcionando

## Estrutura de pastas

```text
webgis-mvp/
|-- backend/
|   |-- main.py
|   |-- routers/
|   |-- services/
|   |-- tests/
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- modules/
|   |   |   |-- swipe/
|   |   |   |-- landcover/
|   |-- package.json
|-- CHANGELOG.md
|-- VERSION
|-- README.md
```

## Observacoes

- A build TypeScript do frontend ainda possui debitos legados em modulos fora do escopo do swipe.
- A suite de testes do backend esta operacional e deve ser usada como baseline.
- Para deploy, padronize todas as chamadas de API no frontend para `VITE_API_URL`.

