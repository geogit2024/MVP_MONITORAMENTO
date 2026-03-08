# Caderno de Testes LULC - Guia Operacional Detalhado (Clique a Clique)

## 1. Objetivo
Este caderno orienta exatamente:
- onde clicar;
- qual campo preencher;
- qual valor usar;
- qual resultado deve aparecer em cada etapa.

Inclui dois fluxos:
1. Classificacao base (LULC).
2. Refinamento zonal/hierarquico (reclassificar apenas uma area).

## 2. Preparacao do ambiente

### 2.1 Backend
1. Abrir terminal.
2. Executar:
```powershell
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
3. Resultado esperado:
- terminal mostra servidor ativo em `http://localhost:8000`.

### 2.2 Frontend
1. Abrir outro terminal.
2. Executar:
```powershell
cd frontend
npm run dev
```
3. Resultado esperado:
- terminal mostra frontend ativo em `http://localhost:5173`.

### 2.3 Validacao da API
1. No navegador, abrir `http://localhost:8000/docs`.
2. Confirmar endpoints:
- `POST /analysis/landcover/classify`
- `GET /analysis/landcover/stats`
- `POST /api/earth-images/refine-classification`
3. Resultado esperado:
- endpoints visiveis na Swagger UI, sem erro 500.

## 3. Dados padrao para teste guiado
- Data inicial: `2025-01-01`
- Data final: `2025-03-31`
- Satelite LULC: Sentinel-2 (fixo no modulo)
- Classes:
1. Agricultura (`#f4d03f`)
2. Pastagem (`#9bd770`)
3. Vegetacao Nativa (`#1f7a3e`)
4. Solo Exposto (`#8d5524`) 
5. Agua (`#2e86de`)
6. Area Urbana (`#7f8c8d`)

## 4. Roteiro principal - interface (passo a passo completo)

### Etapa 1 - Acessar modulo territorial
1. Abrir `http://localhost:5173`.
2. Fazer login.
3. Clicar em `Monitoramento Territorial`.
4. Resultado esperado:
- mapa 2D abre com sidebar lateral.

### Etapa 2 - Definir AOI
1. Na sidebar, localizar secao `Area de Interesse (AOI)`.
2. Use desenho no mapa (toolbar de desenho) e crie 1 poligono.
3. Resultado esperado:
- AOI aparece desenhada no mapa.
- notificacao de sucesso de AOI definida.

### Etapa 3 - Configurar periodo
1. Na secao `Filtros de Busca`:
- campo `Data Inicial` -> preencher `2025-01-01`
- campo `Data Final` -> preencher `2025-03-31`
2. Resultado esperado:
- valores permanecem gravados nos inputs.

### Etapa 4 - Ir para secao LULC
1. Rolar a sidebar ate secao `Classificacao Uso do Solo (LULC)`.
2. Confirmar campo `Fonte Satelite` exibindo `SENTINEL2`.
3. Resultado esperado:
- painel LULC visivel com blocos: Classes, Amostras, Treinar e Classificar.

### Etapa 5 - Validar/editar classes
1. No card `Classes`, confirmar 6 classes padrao.
2. Para editar nome:
- clicar no input de texto da classe e alterar (ex.: `Agricultura` -> `Agricultura Anual`).
3. Para editar cor:
- clicar no seletor de cor da classe e escolher nova cor.
4. Para adicionar classe:
- clicar em `+ Classe`.
5. Resultado esperado:
- lista atualiza em tempo real.
- classe selecionada fica destacada.

### Etapa 6 - Desenhar amostras de treinamento
1. No card `Classes`, clicar na classe desejada (ex.: `Agricultura`).
2. No card `Amostras`, clicar `Desenhar amostras`.
3. No mapa, desenhar 1 pequeno poligono dentro da AOI.
4. Repetir:
- selecionar outra classe (ex.: `Pastagem`);
- desenhar nova amostra.
5. Desenhar no minimo 1 amostra para 2 classes diferentes.
6. Resultado esperado:
- contador de amostras aumenta no badge do card `Amostras`.
- poligonos de amostra aparecem no mapa.
- classe ativa exibida no card `Amostras`.

### Etapa 7 - Executar classificacao
1. No painel LULC, clicar `Treinar e Classificar`.
2. Aguardar processamento.
3. Resultado esperado:
- camada classificada aparece no mapa.
- card `Legenda` aparece com classes e cores.
- card de graficos (pizza e barras) aparece.
- card `Resumo` aparece com `Total classificado`.
- link/botao `Exportar GeoTIFF` aparece.

### Etapa 8 - Validar legenda e visibilidade de camada
1. No card `Legenda`, clicar `Ocultar camada`.
2. Confirmar que raster classificado some do mapa.
3. Clicar `Mostrar camada`.
4. Confirmar que raster volta a aparecer.
5. Resultado esperado:
- toggle funciona instantaneamente sem recarregar pagina.

### Etapa 9 - Validar estatisticas
1. No card de graficos, observar:
- grafico pizza com distribuicao por classe;
- grafico barras com area (ha) por classe.
2. No card `Resumo`, conferir `Total classificado`.
3. Resultado esperado:
- dados numericos coerentes com visualizacao do mapa.

### Etapa 10 - Exportar resultado
1. Clicar `Exportar GeoTIFF`.
2. Resultado esperado:
- abre URL de download (Earth Engine) em nova aba.
- inicia download ou exibe arquivo para baixar.

## 5. Roteiro de refinamento zonal (nova funcionalidade)

Objetivo do refinamento:
- corrigir somente um trecho da classificacao sem recalcular toda AOI.

### Etapa R1 - Preparar base para refinamento
Pre-condicao:
- voce ja executou a classificacao base com sucesso.

1. Confirmar no painel LULC que a classificacao atual esta visivel no mapa.
2. Confirmar que o sistema possui `classification_id` base (internamente salvo).
3. Resultado esperado:
- camada classificada base ativa e pronta para refinamento.

### Etapa R2 - Delimitar area de refinamento
1. Ativar modo de refinamento na interface (quando botao estiver habilitado).
2. Desenhar um novo poligono pequeno apenas onde o resultado ficou ruim.
3. Resultado esperado:
- poligono de refinamento visivel sobre a classificacao.
- restante da AOI permanece inalterado.

### Etapa R3 - Coletar novas amostras dentro da zona
1. Selecionar classe correta no card `Classes`.
2. Clicar `Desenhar amostras`.
3. Desenhar novas amostras APENAS dentro do poligono de refinamento.
4. Repetir para classes relevantes da correção.
5. Resultado esperado:
- contador de amostras aumenta.
- geometria das amostras fica contida na zona refinada.

### Etapa R4 - Executar refinamento
1. No card **Refinamento Zonal**, clicar **Entrar Refinamento**.
2. Clicar **Desenhar Zona** e desenhar no mapa o poligono da area que sera corrigida.
3. Ainda no card **Classes**, selecionar a classe desejada.
4. No card **Amostras**, clicar **Desenhar amostras** e desenhar as novas amostras **dentro da zona de refinamento**.
5. Repetir o passo anterior ate ter pelo menos **3 amostras** de refinamento.
6. Voltar ao card **Refinamento Zonal** e clicar **Aplicar Refinamento**.
7. Resultado esperado:
- backend chama `POST /api/earth-images/refine-classification`.
- resposta inclui novo:
  - `classification_id`
  - `tile_url`
  - `legend`
  - `class_stats`
  - `export_url`
- mapa atualiza somente a area refinada.

### Etapa R5 - Verificar integridade da mesclagem
1. Comparar visualmente:
- fora do poligono de refinamento: deve permanecer igual a classificacao base.
- dentro do poligono: deve refletir nova classificacao.
2. Resultado esperado:
- sem alteracao indevida fora da zona refinada.

### Etapa R6 - Refinamento encadeado
1. Executar um segundo refinamento em outra sub-area.
2. Resultado esperado:
- novo `classification_id` refinado.
- historico cumulativo preservado.
- desempenho melhor que recomputar tudo.

## 6. Testes negativos guiados (com passos exatos)

### TN-01 Sem AOI
1. Clicar `Deletar AOI` na secao AOI.
2. Ir ao painel LULC e clicar `Treinar e Classificar`.
3. Resultado esperado:
- erro amigavel: necessidade de desenhar AOI.
- nenhuma camada classificada adicionada.

### TN-02 Sem amostras
1. Desenhar AOI.
2. No card `Amostras`, clicar `Limpar`.
3. Clicar `Treinar e Classificar`.
4. Resultado esperado:
- erro amigavel: desenhar amostras de treinamento.

### TN-03 Datas invalidas
1. Em `Filtros de Busca`:
- `Data Inicial`: `2025-03-31`
- `Data Final`: `2025-01-01`
2. Com AOI e amostras prontas, clicar `Treinar e Classificar`.
3. Resultado esperado:
- erro de validacao de periodo.

### TN-04 Classe invalida em amostra (API)
1. Abrir Swagger `http://localhost:8000/docs`.
2. Em `POST /analysis/landcover/classify`, enviar amostra com `class_id` inexistente.
3. Resultado esperado:
- HTTP 400 com mensagem de classe invalida.

### TN-05 Refinamento sem classificacao base
1. Chamar `POST /api/earth-images/refine-classification` sem:
- `base_classification_id`
- `base_classification_asset`
2. Resultado esperado:
- HTTP 400 com mensagem solicitando base.

### TN-06 Refinamento com poucas amostras
1. Enviar refinamento com menos de 3 amostras validas na zona.
2. Resultado esperado:
- HTTP 400 com erro de amostras insuficientes.

### TN-07 Refinamento com amostras fora da zona
1. Enviar amostras longe do `refinement_polygon`.
2. Resultado esperado:
- HTTP 400 informando pixels/amostras insuficientes na area.

## 7. Validacao de endpoint de stats (manual)
1. Executar classificacao no frontend.
2. Abrir DevTools > Network.
3. Capturar `classification_id` retornado no `POST /analysis/landcover/classify`.
4. No navegador/Swagger chamar:
```http
GET /analysis/landcover/stats?classification_id={classification_id}
```
5. Resultado esperado:
- HTTP 200
- `legend[]` preenchida
- `class_stats[]` preenchido
- valores compatíveis com painel.

## 8. Validacao do endpoint de refinamento (manual/API)

### 8.1 Payload recomendado (via cache base)
```json
{
  "base_classification_id": "ID_CLASSIFICACAO_BASE",
  "refinement_polygon": {
    "type": "Polygon",
    "coordinates": [[[-47.1,-22.1],[-47.1,-22.09],[-47.09,-22.09],[-47.09,-22.1],[-47.1,-22.1]]]
  },
  "new_training_samples": {
    "type": "FeatureCollection",
    "features": []
  }
}
```

Resultado esperado:
- HTTP 200 com novo `classification_id` refinado.

### 8.2 Critico de integridade
1. Fazer refinamento com area pequena.
2. Validar que classes fora da zona nao mudam.
3. Resultado esperado:
- mesclagem correta (`where(mask, refined)`).

## 9. Checklist de regressao da interface
- [ ] Busca de imagens continua funcionando.
- [ ] Preview de imagens no mapa continua funcionando.
- [ ] NDVI/SAVI/MSAVI/Red-Edge continuam funcionando.
- [ ] Deteccao de mudanca continua funcionando.
- [ ] Carrossel de imagens continua funcionando.
- [ ] Deletar AOI remove camadas e selecoes relacionadas.
- [ ] Alternancia 2D/3D continua funcionando.

## 10. Matriz de testes (preenchimento)

| ID | Acao de interface | Campo/Controle | Valor exato | Resultado esperado | Status |
|---|---|---|---|---|---|
| TC-01 | Definir periodo | Data Inicial | 2025-01-01 | Campo salvo | [ ] |
| TC-02 | Definir periodo | Data Final | 2025-03-31 | Campo salvo | [ ] |
| TC-03 | Desenhar AOI | Mapa | 1 poligono | AOI visivel | [ ] |
| TC-04 | Selecionar classe | Classes | Agricultura | Classe ativa | [ ] |
| TC-05 | Desenhar amostra | Botao Desenhar amostras + mapa | 1 poligono | Contador +1 | [ ] |
| TC-06 | Classificar | Treinar e Classificar | Clique | Raster + legenda + stats | [ ] |
| TC-07 | Ocultar camada | Ocultar camada | Clique | Raster oculto | [ ] |
| TC-08 | Mostrar camada | Mostrar camada | Clique | Raster visivel | [ ] |
| TC-09 | Exportar | Exportar GeoTIFF | Clique | URL/download valido | [ ] |
| TC-10 | Limpar amostras | Limpar | Clique | Contador zerado | [ ] |
| TC-11 | Classificar sem AOI | Treinar e Classificar | Clique | Erro de AOI | [ ] |
| TC-12 | Classificar sem amostras | Treinar e Classificar | Clique | Erro de amostras | [ ] |
| TC-13 | Refinar zona valida | Acao Refinar | Clique | Atualiza apenas zona | [ ] |
| TC-14 | Refinar sem base | Endpoint refine | Sem base id/asset | HTTP 400 | [ ] |
| TC-15 | Refinar com poucas amostras | Endpoint refine | < 3 amostras | HTTP 400 | [ ] |
| TC-16 | Refinamento encadeado | Refinar 2x | Cliques sequenciais | Novo ID e mesclagem correta | [ ] |

## 11. Evidencias obrigatorias
Salvar capturas de tela de:
1. AOI desenhada.
2. Amostras por classe.
3. Resultado classificado no mapa.
4. Legenda.
5. Graficos (pizza e barras).
6. Acao de exportacao.
7. Resposta JSON de `classify`.
8. Resposta JSON de `stats`.
9. Poligono de refinamento desenhado.
10. Antes/depois da zona refinada.
11. Resposta JSON de `refine-classification`.

## 12. Criterio de aprovacao
Homologado quando:
1. Todos os testes criticos passarem: TC-03, TC-05, TC-06, TC-09, TC-11, TC-12.
2. Sem regressao critica no fluxo existente.
3. Usuario consegue executar fluxo completo sem suporte tecnico.
4. Refinamento altera apenas a zona alvo.
5. Endpoint de refinamento responde com novo `classification_id` sem erro 500.

## 13. Registro da execucao
| Data/Hora | Ambiente | Executor | Build/Commit | Casos executados | Aprovado (S/N) | Observacoes |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |
