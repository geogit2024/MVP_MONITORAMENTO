# WebGIS MVP

Plataforma WebGIS para cadastro de propriedades rurais, monitoramento territorial por satélite e gestão de reservatórios, com backend em FastAPI e frontend em React + Vite.

## Visão Geral

O projeto integra mapas interativos, processamento geoespacial e Google Earth Engine para apoiar análise agronômica e tomada de decisão no campo.

Principais capacidades:
- Cadastro e edição de propriedades rurais com geometria (GeoJSON/KML/KMZ)
- Cadastro de talhões vinculados à propriedade
- Gestão de reservatórios (criação, listagem e exclusão)
- Busca de imagens Landsat 8/9 e Sentinel-2
- Cálculo de índices espectrais (NDVI, SAVI, MSAVI, Red-Edge NDVI e outros)
- Detecção de mudanças entre datas (ganho/perda de vegetação)
- Assistente "Pergunte ao Agrônomo" com interpretação técnica por IA
- Download de imagens processadas (GeoTIFF)
- Camada de precipitação mensal (CHIRPS)

## Arquitetura

- `frontend/`: aplicação React + TypeScript (Vite) com Leaflet/React-Leaflet
- `backend/`: API FastAPI com integração Earth Engine e PostGIS
- Banco de dados: PostgreSQL com extensão PostGIS

Fluxo resumido:
1. O frontend desenha/recebe uma AOI (área de interesse)
2. A API consulta coleções no Earth Engine
3. A API retorna tiles, estatísticas e links de download
4. O frontend renderiza camadas e painéis analíticos

## Stack Tecnológica

Frontend:
- React 19, TypeScript, Vite
- Leaflet, React-Leaflet, Leaflet Draw, Turf
- Chart.js / react-chartjs-2

Backend:
- FastAPI, Uvicorn
- SQLAlchemy + GeoAlchemy2
- Earth Engine Python API
- Shapely, Psycopg2

Infra:
- Docker / Docker Compose

## Pré-requisitos

- Node.js 20+
- Python 3.10+
- PostgreSQL 14+ com PostGIS
- Conta Google Cloud com acesso ao Earth Engine
- Arquivo de credenciais de service account (JSON)

## Variáveis de Ambiente

Crie `backend/.env`:

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/webgis
# opcional: sobrescreve o caminho padrão no código
EE_CREDENTIALS_PATH=C:\\RKSISTEMAS\\DEV\\MVP\\webgis-mvp\\backend\\credentials\\credentials.json
# opcional: habilita análise do agrônomo virtual com OpenAI
OPENAI_API_KEY=sk-...
# opcional: modelo (padrão no código: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini
```

No frontend, crie `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
# opcional (camada base custom)
VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

## Como Executar

### 1. Backend (local)

```bash
cd backend
'python -m venv .venv'
# Windows
.venv\Scripts\activate
# Linux/macOS
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API disponível em: `http://localhost:8000`

Swagger: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Aplicação disponível em: `http://localhost:5173`

### 3. Execução com Docker (backend)

Na raiz do repositório:

```bash
docker compose up --build
```

## Endpoints Principais

### Propriedades
- `POST /api/properties`
- `PUT /api/properties/{property_id}`
- `DELETE /api/properties/{property_id}`
- `GET /api/properties`
- `GET /api/properties/{property_id}`
- `POST /api/properties/{property_id}/talhoes`

### Reservatórios
- `POST /api/reservoirs`
- `GET /api/reservoirs`
- `DELETE /api/reservoirs/{reservoir_id}`

### Earth Engine
- `POST /api/earth-images/search`
- `POST /api/earth-images/preview`
- `POST /api/earth-images/indices`
- `POST /api/earth-images/change-detection`
- `POST /api/earth-images/download-info`
- `GET /api/earth-images/precipitation-tiles`

### Agrônomo Virtual (IA)
- `POST /api/agronomo/relatorio`
- `GET /api/agronomo/relatorios?talhao={nome}&limit={n}`
- `GET /api/agronomo/relatorio/{report_id}/comparar-anterior`

## Pergunte ao Agrônomo (Fluxo)

1. Execute a análise (ex.: detecção de mudança) para abrir o painel de resultados.
2. Clique no botão **Pergunte ao Agrônomo**.
3. O frontend envia para o backend:
   - talhão/área
   - período analisado
   - índice e estatísticas
   - valores usados no gráfico/painel
4. O backend gera o relatório com IA, persiste no PostgreSQL e retorna:
   - resumo
   - diagnóstico
   - causas
   - recomendações
   - nível de atenção (`baixo`, `medio`, `alto`)
5. O frontend exibe modal com:
   - cor por nível de atenção
   - timestamp da análise
   - histórico recente
   - comparação com análise anterior
   - exportação para PDF (impressão do navegador)

## Estrutura de Pastas

```text
webgis-mvp/
|-- backend/
|   |-- main.py
|   |-- requirements.txt
|   |-- Dockerfile
|   |-- credentials/
|-- frontend/
|   |-- src/
|   |-- package.json
|   |-- vite.config.ts
|-- docker-compose.yml
|-- README.md
```

## Observações Importantes

- O `README.md` anterior estava com conflito de merge e foi reescrito.
- Existem chamadas no frontend para rotas como `/api/assistant/prompt` e `/api/talhoes/{id}/generate-grid` que não estão presentes no `backend/main.py` atual. Se esses recursos forem necessários, implemente os endpoints ou ajuste o frontend.
- Alguns componentes ainda usam `http://localhost:8000` fixo em vez de `VITE_API_URL`; padronizar isso facilita deploy.

## Boas Práticas Recomendadas

- Não versionar arquivos de credenciais (`*.json`) no Git
- Criar `backend/.env.example` e `frontend/.env.example`
- Adicionar pipeline de lint/test/build no CI
- Versionar esquema do banco com migrações (ex.: Alembic)

## Licença

Defina aqui a licença do projeto (ex.: MIT, Apache-2.0, proprietária).
