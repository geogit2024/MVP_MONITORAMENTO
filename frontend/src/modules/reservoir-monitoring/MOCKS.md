# Mocks do Modulo de Reservatorios

## Visao geral
O dashboard de monitoramento de reservatorios pode operar com uma fonte de dados mockada, desacoplada do backend real.

Os mocks simulam 6 meses de ciclos com dados coerentes entre:
- reservatorios e areas monitoradas (AOI, APP e entorno);
- campanhas/imagens por periodo;
- indicadores ambientais;
- classificacao de uso do solo;
- deteccao de mudanca;
- alertas operacionais;
- historico analitico;
- geometrias GeoJSON para visualizacao no mapa.

## Estrutura criada
- `scripts/seed-reservoir-monitoring-mocks.mjs`
- `frontend/src/modules/reservoir-monitoring/mock/types.ts`
- `frontend/src/modules/reservoir-monitoring/mock/mock-seed.json`
- `frontend/src/modules/reservoir-monitoring/mock/mockService.ts`
- `frontend/src/modules/reservoir-monitoring/api.ts` (seletor de provider mock x real)

## Como gerar/atualizar o seed
Na raiz do projeto:

```bash
npm run seed:reservoir-mocks
```

Ou dentro de `frontend/`:

```bash
npm run seed:reservoir-mocks
```

O comando regenera o arquivo:
- `frontend/src/modules/reservoir-monitoring/mock/mock-seed.json`

## Como ativar os mocks no frontend
Defina a variavel de ambiente no frontend:

```env
VITE_RESERVOIR_MOCKS=1
```

Valores aceitos como "ligado": `1`, `true`, `yes`, `on`, `mock`.

Com isso, `frontend/src/modules/reservoir-monitoring/api.ts` usa o `mockService` em vez de chamar endpoints HTTP.

## Comportamento no dashboard
Com mock habilitado:
- cards de resumo sao preenchidos por `getReservoirDashboard()`;
- busca de imagens retorna campanhas sinteticas;
- thumbnails e preview usam URLs/data URI mockadas;
- analises (indices, espelho dagua, serie temporal, uso do solo, mudanca, APP, turbidez) retornam resultados coerentes com o ciclo selecionado;
- alertas e historico sao atualizados no estado mock em memoria;
- exportacao CSV gera `data:text/csv` diretamente no browser.

## Como substituir por integracao real sem quebrar o dashboard
1. Mantenha as assinaturas exportadas de `api.ts`.
2. Implemente/ajuste apenas o provider real (HTTP) mantendo os mesmos contratos de retorno.
3. Desative `VITE_RESERVOIR_MOCKS` (ou remova a variavel).
4. Valide fluxo ponta a ponta na mesma UI sem trocar componentes.

## Checklist rapido de validacao visual
1. Abrir `/reservatorios` com `VITE_RESERVOIR_MOCKS=1`.
2. Verificar cards e reservatorio inicial carregados.
3. Buscar imagens por periodo e abrir preview.
4. Executar: indices, espelho dagua, serie temporal, uso do solo, mudancas, APP, turbidez.
5. Gerar insight e validar lista de alertas/historico.
6. Exportar CSV e conferir download.
