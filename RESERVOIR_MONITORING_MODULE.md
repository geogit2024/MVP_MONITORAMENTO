# Modulo de Monitoramento Ambiental de Reservatorios

## Visao Geral
O modulo foi integrado na arquitetura existente do projeto (`React/Vite + FastAPI + Google Earth Engine + PostgreSQL/PostGIS`) sem substituir fluxos legados.

Fluxo operacional implementado:
1. Selecao/cadastro do reservatorio.
2. Delimitacao de AOI/APP/entorno.
3. Busca de imagens por periodo.
4. Execucao de analises (indices, espelho d'agua, serie temporal, uso do solo, mudancas, APP, turbidez).
5. Persistencia de historico e indicadores.
6. Geracao de alertas.
7. Insight tecnico automatizado.
8. Dashboard operacional e exportacao CSV de indicadores.

## Reuso da Arquitetura Atual
Componentes e servicos reaproveitados:
- `frontend/src/components/MapView.tsx` para visualizacao, desenho AOI e camadas.
- Endpoints existentes:
  - `/api/earth-images/search`
  - `/api/earth-images/indices`
  - `/api/earth-images/change-detection`
- Funcoes backend existentes:
  - `create_ee_geometry_from_json`
  - `get_image_bands`
  - `calculate_indices_gee`
- Estrutura de banco e `metadata.create_all` existente em `backend/main.py`.

## Novas Entidades (Backend)
Adicionadas em `backend/main.py`:
- `reservatorio_contexto`
- `reservatorio_area_monitoramento`
- `reservatorio_app`
- `analise_reservatorio`
- `imagem_reservatorio`
- `resultado_indice`
- `serie_temporal_indicador`
- `resultado_espelho_agua`
- `resultado_classificacao_uso_solo`
- `resultado_deteccao_mudanca`
- `alerta_reservatorio`
- `insight_ia_reservatorio`

## Endpoints do Modulo
Base: `/api/reservoir-monitoring`

### Contexto e Areas
- `GET /reservoirs/{id}/context`
- `PUT /reservoirs/{id}/context`
- `POST /reservoirs/{id}/areas`
- `GET /reservoirs/{id}/areas`
- `DELETE /reservoirs/{id}/areas/{area_id}`

### Imagens e Analises
- `POST /reservoirs/{id}/images/search`
- `POST /reservoirs/{id}/indices`
- `POST /reservoirs/{id}/waterbody/extract`
- `GET /reservoirs/{id}/waterbody/history`
- `POST /reservoirs/{id}/timeseries`
- `POST /reservoirs/{id}/landuse/classify`
- `POST /reservoirs/{id}/change-detection`
- `POST /reservoirs/{id}/riparian/monitor`
- `POST /reservoirs/{id}/proxies/turbidity`

### Operacao, IA e Relatorios
- `GET /reservoirs/{id}/alerts`
- `PATCH /alerts/{alert_id}`
- `GET /reservoirs/{id}/history`
- `POST /reservoirs/{id}/ai-insights`
- `GET /dashboard`
- `GET /reservoirs/{id}/report` (`export_format=json|csv`)

## Frontend do Modulo
Pagina operacional:
- `frontend/src/pages/ReservoirPanel.tsx`

Servico de API:
- `frontend/src/modules/reservoir-monitoring/api.ts`
- `frontend/src/modules/reservoir-monitoring/types.ts`

Principais recursos de UI:
- Mapa operacional com `MapView`.
- Seletor de reservatorio.
- Delimitacao AOI/APP/entorno.
- Filtros temporais e satelite.
- Lista de imagens para analise.
- Botoes analiticos por etapa.
- Blocos de resultado (indices, agua, APP/turbidez, uso do solo).
- Grafico temporal.
- Grafico de deteccao de mudanca.
- Lista de alertas com resolucao.
- Insight tecnico de IA.
- Exportacao CSV.

## Regras de Negocio Implementadas
- Analises exigem reservatorio valido.
- Contexto/AOI podem ser herdados do reservatorio quando nao informados.
- Cada execucao gera registro em `analise_reservatorio`.
- Alertas so sao disparados por comparacao com limiares configurados.
- Indicadores de assoreamento/turbidez sao tratados como proxies indiretos.
- Historico e dashboard usam dados persistidos.

## Limites e Observacoes
- Turbidez e assoreamento sao proxies espectrais indiretos.
- Classificacao de uso do solo implementada por heuristica espectral operacional.
- Validacao de campo continua recomendada para decisoes criticas.
- Insight IA do modulo de reservatorio agora suporta provider LLM em producao (OpenAI/API compatível), com fallback heuristico automatico.

## Configuracao LLM (Producao)
Variaveis de ambiente suportadas:
- `RESERVOIR_AI_PROVIDER`:
  - `openai` (padrao): tenta provider LLM e faz fallback para heuristica se falhar.
  - `heuristic` / `off` / `disabled` / `none`: desativa chamada externa e usa apenas heuristica.
- `OPENAI_API_KEY`: chave do provider.
- `OPENAI_RESERVOIR_MODEL`: modelo especifico para insights de reservatorio (opcional).
- `OPENAI_MODEL`: fallback global de modelo (opcional, padrao `gpt-4o-mini`).
- `OPENAI_CHAT_COMPLETIONS_URL`: URL completa de chat completions (opcional).
- `OPENAI_BASE_URL`: base URL OpenAI-compatible (opcional; usado quando `OPENAI_CHAT_COMPLETIONS_URL` nao estiver definida).

Comportamento:
- Se a chamada LLM falhar, retornar resposta invalida ou estiver sem chave, o endpoint retorna insight heuristico sem quebrar o fluxo operacional.
- O registro persistido inclui `source` (`openai` ou `heuristic`) e `model` (quando aplicavel) no `prompt_json`.

## Roteiro de Testes
### Backend
1. Cadastrar reservatorio.
2. Definir contexto (`PUT /context`).
3. Criar areas (`POST /areas` para AOI/APP).
4. Buscar imagens (`POST /images/search`).
5. Rodar indices (`POST /indices`).
6. Extrair espelho d'agua (`POST /waterbody/extract`).
7. Gerar serie temporal (`POST /timeseries`).
8. Rodar classificacao de uso do solo (`POST /landuse/classify`).
9. Rodar mudanca (`POST /change-detection`).
10. Rodar APP (`POST /riparian/monitor`) e turbidez (`POST /proxies/turbidity`).
11. Validar alertas (`GET /alerts` e `PATCH /alerts/{id}`).
12. Gerar insight (`POST /ai-insights`) e dashboard (`GET /dashboard`).
13. Exportar relatorio CSV (`GET /report?export_format=csv`).

### Frontend
1. Acessar rota `/reservatorios`.
2. Selecionar/cadastrar reservatorio.
3. Desenhar AOI/APP/entorno no mapa.
4. Buscar imagens e selecionar cenas.
5. Executar cada analise e verificar camada no mapa.
6. Validar exibicao de cards, grafico temporal e grafico de mudanca.
7. Validar insight IA e lista de alertas.
8. Exportar CSV de indicadores.

## Dados Mockados (Dashboard)
Foi adicionada uma fonte mock desacoplada para demonstracao e testes funcionais do modulo de reservatorios.

Arquivos:
- `scripts/seed-reservoir-monitoring-mocks.mjs`
- `frontend/src/modules/reservoir-monitoring/mock/types.ts`
- `frontend/src/modules/reservoir-monitoring/mock/mock-seed.json`
- `frontend/src/modules/reservoir-monitoring/mock/mockService.ts`
- `frontend/src/modules/reservoir-monitoring/MOCKS.md`

Ativacao:
- Definir `VITE_RESERVOIR_MOCKS=1` no frontend.

Seed:
- Rodar `npm run seed:reservoir-mocks` (raiz) para regenerar 6 meses de ciclos sinteticos coerentes.
