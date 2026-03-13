import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MONTHS = 6;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(SCRIPT_DIR, '../frontend/src/modules/reservoir-monitoring/mock/mock-seed.json');

const LANDUSE_LEGEND = [
  { id: 1, name: 'Agua', color: '#2e86de' },
  { id: 2, name: 'Vegetacao', color: '#1f7a3e' },
  { id: 3, name: 'Solo Exposto', color: '#8d5524' },
  { id: 4, name: 'Agricultura/Pastagem', color: '#f4d03f' },
  { id: 5, name: 'Area Antropica', color: '#7f8c8d' },
  { id: 6, name: 'Outros', color: '#95a5a6' },
];

const reservoirDefs = [
  {
    id: 1,
    name: 'Reservatorio da UHE Jirau',
    description: 'Monitoramento continuo da lamina dagua e APP em Porto Velho (RO).',
    center: [-64.676, -9.264],
    size: [0.36, 0.24],
    codigo: 'RSV-RO-001',
    tipo: 'hidreletrico',
    responsavel: 'Energia Sustentavel do Brasil S.A.',
    municipio: 'Porto Velho',
    estado: 'RO',
    areaBaseHa: 29500,
  },
  {
    id: 2,
    name: 'Reservatorio de Sobradinho',
    description: 'Controle operacional de variacao hidrica e uso do solo no entorno.',
    center: [-40.836, -9.434],
    size: [0.44, 0.28],
    codigo: 'RSV-BA-002',
    tipo: 'abastecimento',
    responsavel: 'Companhia Hidro Eletrica do Sao Francisco',
    municipio: 'Sobradinho',
    estado: 'BA',
    areaBaseHa: 38200,
  },
  {
    id: 3,
    name: 'Reservatorio de Furnas',
    description: 'Monitoramento de tendencia ambiental e alertas de criticidade.',
    center: [-46.331, -20.671],
    size: [0.31, 0.22],
    codigo: 'RSV-MG-003',
    tipo: 'multiplo_uso',
    responsavel: 'Furnas Centrais Eletricas',
    municipio: 'Sao Jose da Barra',
    estado: 'MG',
    areaBaseHa: 24800,
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toIsoDate = (date) => date.toISOString().slice(0, 10);
const toIsoDateTime = (date) => `${toIsoDate(date)}T10:00:00Z`;

const createRng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const rectanglePolygon = (center, size) => {
  const [lon, lat] = center;
  const [dx, dy] = size;
  const x1 = lon - dx / 2;
  const x2 = lon + dx / 2;
  const y1 = lat - dy / 2;
  const y2 = lat + dy / 2;
  return {
    type: 'Polygon',
    coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]],
  };
};

const scalePolygon = (polygon, center, factor) => {
  const [cx, cy] = center;
  const ring = polygon.coordinates[0].map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
  return { type: 'Polygon', coordinates: [ring] };
};

const polygonMetrics = (center, size) => {
  const [dx, dy] = size;
  const latRad = (center[1] * Math.PI) / 180;
  const widthKm = dx * 111 * Math.cos(latRad);
  const heightKm = dy * 111;
  const areaHa = Math.max(50, widthKm * heightKm * 100);
  const perimeterKm = 2 * (widthKm + heightKm);
  return { areaHa, perimeterKm };
};

const monthsFromReference = (referenceDate, months) => {
  const base = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 15));
  const points = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    points.push(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - offset, 15)));
  }
  return points;
};

const textSvgDataUri = (title, colorA, colorB) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'>
  <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${colorA}'/><stop offset='100%' stop-color='${colorB}'/></linearGradient></defs>
  <rect width='100%' height='100%' fill='url(#g)'/>
  <rect x='8' y='8' width='304' height='164' rx='12' ry='12' fill='rgba(0,0,0,0.2)' stroke='rgba(255,255,255,0.45)'/>
  <text x='16' y='102' font-size='16' fill='white' font-family='Segoe UI, Arial'>${title}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const buildDataset = () => {
  const now = new Date();
  const monthPoints = monthsFromReference(now, MONTHS);
  const periodStart = toIsoDate(monthPoints[0]);
  const periodEnd = toIsoDate(monthPoints[monthPoints.length - 1]);

  const reservoirs = [];
  const contexts = {};
  const areas = {};
  const images = {};
  const imageMeta = [];
  const timeseries = {};
  const cycles = {};
  const alerts = {};
  const history = {};

  let alertId = 1;
  let historyId = 1;

  for (const def of reservoirDefs) {
    const rng = createRng(def.id * 911);
    const reservoirGeom = rectanglePolygon(def.center, def.size);
    const appGeom = scalePolygon(reservoirGeom, def.center, 1.22);
    const surroundingsGeom = scalePolygon(reservoirGeom, def.center, 1.78);

    const metricsMain = polygonMetrics(def.center, def.size);
    const metricsApp = polygonMetrics(def.center, [def.size[0] * 1.22, def.size[1] * 1.22]);
    const metricsSurroundings = polygonMetrics(def.center, [def.size[0] * 1.78, def.size[1] * 1.78]);

    reservoirs.push({
      type: 'Feature',
      geometry: reservoirGeom,
      properties: {
        id: def.id,
        name: def.name,
        description: def.description,
      },
    });

    contexts[String(def.id)] = {
      reservoir_id: def.id,
      reservatorio_nome: def.name,
      reservatorio_codigo: def.codigo,
      reservatorio_tipo: def.tipo,
      orgao_responsavel: def.responsavel,
      municipio: def.municipio,
      estado: def.estado,
      status_monitoramento: 'active',
      parametros: {
        periodicidade: 'mensal',
        limiar_alerta_agua_pct: 12,
        limiar_ndvi_app_pct: 15,
        limiar_proxy_turbidez: 0.16,
      },
      metadados: {
        demonstracao: true,
        fonte: 'mock-seed',
      },
      geom_monitoramento: reservoirGeom,
      geom_entorno: surroundingsGeom,
      geom_app: appGeom,
      geom_bacia_imediata: null,
      updated_at: `${periodEnd}T10:00:00Z`,
    };

    areas[String(def.id)] = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: def.id * 100 + 1,
            reservoir_id: def.id,
            nome_area: 'Area de Monitoramento',
            tipo_area: 'monitoring_aoi',
            area_ha: Number(metricsMain.areaHa.toFixed(2)),
            perimetro_km: Number(metricsMain.perimeterKm.toFixed(2)),
            created_at: `${periodStart}T10:00:00Z`,
          },
          geometry: reservoirGeom,
        },
        {
          type: 'Feature',
          properties: {
            id: def.id * 100 + 2,
            reservoir_id: def.id,
            nome_area: 'APP',
            tipo_area: 'app',
            area_ha: Number(metricsApp.areaHa.toFixed(2)),
            perimetro_km: Number(metricsApp.perimeterKm.toFixed(2)),
            created_at: `${periodStart}T10:00:00Z`,
          },
          geometry: appGeom,
        },
        {
          type: 'Feature',
          properties: {
            id: def.id * 100 + 3,
            reservoir_id: def.id,
            nome_area: 'Entorno',
            tipo_area: 'surroundings',
            area_ha: Number(metricsSurroundings.areaHa.toFixed(2)),
            perimetro_km: Number(metricsSurroundings.perimeterKm.toFixed(2)),
            created_at: `${periodStart}T10:00:00Z`,
          },
          geometry: surroundingsGeom,
        },
      ],
    };

    const reservoirImages = [];
    const reservoirCycles = [];
    const reservoirSeries = [];
    const reservoirAlerts = [];
    const reservoirHistory = [];

    const soilPctBase = 14 + def.id * 1.4;
    const anthPctBase = 9 + def.id;
    const vegPctBase = 44 + def.id * 2;
    const waterBase = def.areaBaseHa;
    let previousAppNdvi = null;
    let previousSoilPct = null;
    let previousAnthPct = null;
    let previousWaterArea = null;

    for (let i = 0; i < monthPoints.length; i += 1) {
      const dateRef = monthPoints[i];
      const dateIso = toIsoDate(dateRef);
      const season = Math.sin((i / (monthPoints.length - 1 || 1)) * Math.PI * 2 - 0.8);
      const noise = (rng() - 0.5) * 0.035;
      const satellite = i % 2 === 0 ? 'SENTINEL_2A' : 'LANDSAT_9';
      const cloudPct = Math.round(clamp(15 + i * 3 + season * 12 + rng() * 20, 2, 80));
      const imageId = `MOCK/R${def.id}/${dateIso}/${satellite}`;
      const campaignName = `Ciclo ${dateIso.slice(0, 7)}`;
      const thumb = textSvgDataUri(`${def.name} - ${dateIso}`, '#1e3a8a', '#0f766e');

      reservoirImages.push({
        id: imageId,
        date: dateIso,
        thumbnailUrl: thumb,
      });

      imageMeta.push({
        image_id: imageId,
        reservoir_id: def.id,
        date: dateIso,
        satellite,
        cloud_pct: cloudPct,
      });

      const ndvi = clamp(0.56 + season * 0.09 + noise - i * 0.003, 0.31, 0.82);
      const ndwi = clamp(0.18 + season * 0.08 - i * 0.005 + noise, -0.12, 0.56);
      const mndwi = clamp(0.2 + season * 0.1 - i * 0.004 + noise, -0.08, 0.62);
      const ndmi = clamp(0.31 + season * 0.06 - i * 0.004 + noise, 0.02, 0.62);
      const savi = clamp(0.49 + season * 0.08 + noise - i * 0.003, 0.21, 0.77);
      const turbidity = clamp(0.09 + i * 0.012 - season * 0.03 + noise, 0.03, 0.33);
      const waterArea = clamp(waterBase + season * 2200 - i * 380 + (rng() - 0.5) * 1400, waterBase * 0.66, waterBase * 1.16);

      const waterPct = clamp((waterArea / metricsSurroundings.areaHa) * 100, 18, 58);
      const soilPct = clamp(soilPctBase + i * 1.2 + (rng() - 0.5) * 2.3, 8, 36);
      const anthPct = clamp(anthPctBase + i * 0.65 + (rng() - 0.5) * 1.7, 5, 24);
      const agriPct = clamp(18 + season * 2.5 + (rng() - 0.5) * 1.6, 9, 28);
      const vegPct = clamp(vegPctBase - i * 1.5 - season * 4 + (rng() - 0.5) * 2.2, 20, 57);
      const othersPct = Math.max(0, 100 - (waterPct + soilPct + anthPct + agriPct + vegPct));

      const currentAppNdvi = clamp(ndvi - 0.06 + (rng() - 0.5) * 0.03, 0.22, 0.76);
      const appVariation =
        previousAppNdvi && previousAppNdvi > 0
          ? ((currentAppNdvi - previousAppNdvi) / previousAppNdvi) * 100
          : null;

      const soilDelta =
        previousSoilPct && previousSoilPct > 0 ? ((soilPct - previousSoilPct) / previousSoilPct) * 100 : null;
      const anthDelta =
        previousAnthPct && previousAnthPct > 0 ? ((anthPct - previousAnthPct) / previousAnthPct) * 100 : null;

      const waterVariationPct =
        previousWaterArea && previousWaterArea > 0 ? ((waterArea - previousWaterArea) / previousWaterArea) * 100 : null;

      const gainArea = Math.max(0.3, (waterVariationPct || 0) > 0 ? Math.abs(waterVariationPct) * 0.28 + rng() * 1.1 : rng() * 0.9);
      const lossArea = Math.max(0.4, (waterVariationPct || 0) < 0 ? Math.abs(waterVariationPct) * 0.34 + rng() * 1.8 : rng() * 1.1);

      const waterGeo = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              source: 'mock-water-mask',
              date: dateIso,
              area_ha: Number(waterArea.toFixed(2)),
            },
            geometry: scalePolygon(reservoirGeom, def.center, clamp(Math.sqrt(waterArea / waterBase), 0.78, 1.21)),
          },
        ],
      };

      const changeGeo = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              change_type: 'gain',
              area_ha: Number(gainArea.toFixed(2)),
              date: dateIso,
            },
            geometry: rectanglePolygon([def.center[0] + 0.04, def.center[1] + 0.03], [0.05, 0.04]),
          },
          {
            type: 'Feature',
            properties: {
              change_type: 'loss',
              area_ha: Number(lossArea.toFixed(2)),
              date: dateIso,
            },
            geometry: rectanglePolygon([def.center[0] - 0.05, def.center[1] - 0.02], [0.045, 0.035]),
          },
        ],
      };

      reservoirCycles.push({
        id: def.id * 1000 + i + 1,
        reservoir_id: def.id,
        campaign_name: campaignName,
        date: dateIso,
        image_id: imageId,
        satellite,
        cloud_pct: cloudPct,
        indicators: {
          ndvi: Number(ndvi.toFixed(4)),
          ndwi: Number(ndwi.toFixed(4)),
          mndwi: Number(mndwi.toFixed(4)),
          ndmi: Number(ndmi.toFixed(4)),
          savi: Number(savi.toFixed(4)),
          turbidity_proxy: Number(turbidity.toFixed(4)),
          water_area_ha: Number(waterArea.toFixed(2)),
        },
        app: {
          ndvi_mean: Number(currentAppNdvi.toFixed(4)),
          previous_ndvi_mean: previousAppNdvi !== null ? Number(previousAppNdvi.toFixed(4)) : null,
          variacao_pct: appVariation !== null ? Number(appVariation.toFixed(2)) : null,
        },
        turbidity: {
          min: Number(clamp(turbidity - 0.04, 0.01, 0.4).toFixed(4)),
          max: Number(clamp(turbidity + 0.05, 0.02, 0.45).toFixed(4)),
          mean: Number(turbidity.toFixed(4)),
        },
        landuse: {
          legend: LANDUSE_LEGEND,
          class_stats: [
            { class_id: 1, class_name: 'Agua', color: '#2e86de', area_ha: Number((metricsSurroundings.areaHa * waterPct / 100).toFixed(2)), area_pct: Number(waterPct.toFixed(2)) },
            { class_id: 2, class_name: 'Vegetacao', color: '#1f7a3e', area_ha: Number((metricsSurroundings.areaHa * vegPct / 100).toFixed(2)), area_pct: Number(vegPct.toFixed(2)) },
            { class_id: 3, class_name: 'Solo Exposto', color: '#8d5524', area_ha: Number((metricsSurroundings.areaHa * soilPct / 100).toFixed(2)), area_pct: Number(soilPct.toFixed(2)) },
            { class_id: 4, class_name: 'Agricultura/Pastagem', color: '#f4d03f', area_ha: Number((metricsSurroundings.areaHa * agriPct / 100).toFixed(2)), area_pct: Number(agriPct.toFixed(2)) },
            { class_id: 5, class_name: 'Area Antropica', color: '#7f8c8d', area_ha: Number((metricsSurroundings.areaHa * anthPct / 100).toFixed(2)), area_pct: Number(anthPct.toFixed(2)) },
            { class_id: 6, class_name: 'Outros', color: '#95a5a6', area_ha: Number((metricsSurroundings.areaHa * othersPct / 100).toFixed(2)), area_pct: Number(othersPct.toFixed(2)) },
          ],
          comparison: {
            soil_exposed_delta_pct: soilDelta !== null ? Number(soilDelta.toFixed(2)) : null,
            anthropic_delta_pct: anthDelta !== null ? Number(anthDelta.toFixed(2)) : null,
          },
        },
        change: {
          gain_area_ha: Number(gainArea.toFixed(2)),
          loss_area_ha: Number(lossArea.toFixed(2)),
          total_area_ha: Number(metricsSurroundings.areaHa.toFixed(2)),
          change_geojson: changeGeo,
        },
        water_geojson: waterGeo,
      });

      reservoirSeries.push({
        date: dateIso,
        ndvi: Number(ndvi.toFixed(4)),
        ndwi: Number(ndwi.toFixed(4)),
        mndwi: Number(mndwi.toFixed(4)),
        ndmi: Number(ndmi.toFixed(4)),
        savi: Number(savi.toFixed(4)),
        turbidity_proxy: Number(turbidity.toFixed(4)),
        water_area_ha: Number(waterArea.toFixed(2)),
        app_ndvi_mean: Number(currentAppNdvi.toFixed(4)),
      });

      const cycleHistoryBase = {
        campaign_name: campaignName,
        image_id: imageId,
        date: dateIso,
        satellite,
      };

      reservoirHistory.push(
        {
          id: historyId++,
          analysis_id: def.id * 10000 + i * 10 + 1,
          tipo_analise: 'indices',
          created_at: toIsoDateTime(dateRef),
          parametros: cycleHistoryBase,
          resultado: { ndvi: Number(ndvi.toFixed(4)), ndwi: Number(ndwi.toFixed(4)), ndmi: Number(ndmi.toFixed(4)) },
        },
        {
          id: historyId++,
          analysis_id: def.id * 10000 + i * 10 + 2,
          tipo_analise: 'espelho_agua',
          created_at: toIsoDateTime(dateRef),
          parametros: cycleHistoryBase,
          resultado: {
            area_ha: Number(waterArea.toFixed(2)),
            variacao_percentual: waterVariationPct !== null ? Number(waterVariationPct.toFixed(2)) : null,
          },
        },
        {
          id: historyId++,
          analysis_id: def.id * 10000 + i * 10 + 3,
          tipo_analise: 'classificacao_uso_solo',
          created_at: toIsoDateTime(dateRef),
          parametros: cycleHistoryBase,
          resultado: {
            solo_exposto_pct: Number(soilPct.toFixed(2)),
            antropica_pct: Number(anthPct.toFixed(2)),
          },
        },
        {
          id: historyId++,
          analysis_id: def.id * 10000 + i * 10 + 4,
          tipo_analise: 'deteccao_mudanca',
          created_at: toIsoDateTime(dateRef),
          parametros: cycleHistoryBase,
          resultado: {
            gain_area_ha: Number(gainArea.toFixed(2)),
            loss_area_ha: Number(lossArea.toFixed(2)),
          },
        }
      );

      const candidateAlerts = [];
      if (waterVariationPct !== null && waterVariationPct <= -8) {
        candidateAlerts.push({
          tipo_alerta: 'reducao_espelho_agua',
          severidade: waterVariationPct <= -15 ? 'high' : 'medium',
          mensagem: `Reducao abrupta da area alagada (${waterVariationPct.toFixed(2)}%).`,
          valor_metrica: Number(waterVariationPct.toFixed(2)),
          valor_limiar: -8,
        });
      }
      if (appVariation !== null && appVariation <= -10) {
        candidateAlerts.push({
          tipo_alerta: 'queda_ndvi_app',
          severidade: appVariation <= -18 ? 'high' : 'medium',
          mensagem: `Queda de vigor vegetativo na APP (${appVariation.toFixed(2)}%).`,
          valor_metrica: Number(appVariation.toFixed(2)),
          valor_limiar: -10,
        });
      }
      if (turbidity >= 0.16) {
        candidateAlerts.push({
          tipo_alerta: 'aumento_proxy_turbidez',
          severidade: turbidity >= 0.22 ? 'high' : 'medium',
          mensagem: `Proxy de turbidez acima do limite (${turbidity.toFixed(4)}).`,
          valor_metrica: Number(turbidity.toFixed(4)),
          valor_limiar: 0.16,
        });
      }
      if (soilDelta !== null && soilDelta >= 8) {
        candidateAlerts.push({
          tipo_alerta: 'aumento_solo_exposto',
          severidade: soilDelta >= 18 ? 'high' : 'low',
          mensagem: `Evolucao de solo exposto no entorno (${soilDelta.toFixed(2)}%).`,
          valor_metrica: Number(soilDelta.toFixed(2)),
          valor_limiar: 8,
        });
      }

      for (const alert of candidateAlerts) {
        const isRecent = i >= monthPoints.length - 2;
        reservoirAlerts.push({
          id: alertId++,
          analysis_id: def.id * 10000 + i * 10 + 9,
          tipo_alerta: alert.tipo_alerta,
          severidade: alert.severidade,
          mensagem: alert.mensagem,
          valor_metrica: alert.valor_metrica,
          valor_limiar: alert.valor_limiar,
          status: isRecent ? 'active' : 'resolved',
          contexto: {
            reservoir_id: def.id,
            campaign: campaignName,
            date: dateIso,
          },
          data_alerta: `${dateIso}T11:00:00Z`,
        });
      }

      previousAppNdvi = currentAppNdvi;
      previousSoilPct = soilPct;
      previousAnthPct = anthPct;
      previousWaterArea = waterArea;
    }

    images[String(def.id)] = reservoirImages.sort((a, b) => b.date.localeCompare(a.date));
    timeseries[String(def.id)] = reservoirSeries.sort((a, b) => a.date.localeCompare(b.date));
    cycles[String(def.id)] = reservoirCycles.sort((a, b) => a.date.localeCompare(b.date));
    alerts[String(def.id)] = reservoirAlerts.sort((a, b) => String(b.data_alerta || '').localeCompare(String(a.data_alerta || '')));
    history[String(def.id)] = reservoirHistory.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  const allAlerts = Object.values(alerts).flat();
  const activeAlerts = allAlerts.filter((item) => item.status === 'active');
  const severityOrder = ['high', 'medium', 'low'];
  const ocorrencias = severityOrder.map((severidade) => ({
    severidade,
    qtd: activeAlerts.filter((item) => item.severidade === severidade).length,
  }));

  const ranking = reservoirDefs
    .map((def) => ({
      reservoir_id: def.id,
      reservatorio_nome: def.name,
      active_alerts: (alerts[String(def.id)] || []).filter((item) => item.status === 'active').length,
    }))
    .sort((a, b) => b.active_alerts - a.active_alerts);

  const variacaoMedia = reservoirDefs
    .map((def) => {
      const c = cycles[String(def.id)] || [];
      if (c.length < 2) return 0;
      const current = c[c.length - 1].indicators.water_area_ha;
      const previous = c[c.length - 2].indicators.water_area_ha;
      if (!previous) return 0;
      return ((current - previous) / previous) * 100;
    })
    .reduce((acc, value) => acc + value, 0) / Math.max(1, reservoirDefs.length);

  const dashboard = {
    total_reservatorios_monitorados: reservoirs.length,
    reservatorios_ativos_monitoramento: Object.values(contexts).filter((ctx) => ctx.status_monitoramento === 'active').length,
    alertas_ativos: activeAlerts.length,
    variacao_media_area_alagada_pct: Number(variacaoMedia.toFixed(2)),
    ocorrencias_por_severidade: ocorrencias,
    ranking_criticidade: ranking,
  };

  return {
    meta: {
      generated_at: new Date().toISOString(),
      months: MONTHS,
      period_start: periodStart,
      period_end: periodEnd,
    },
    reservoirs,
    contexts,
    areas,
    images,
    image_meta: imageMeta,
    timeseries,
    cycles,
    alerts,
    history,
    dashboard,
  };
};

const run = async () => {
  const dataset = buildDataset();
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`Mock seed criado: ${OUT_FILE}`);
  console.log(`Periodo: ${dataset.meta.period_start} -> ${dataset.meta.period_end}`);
  console.log(`Reservatorios: ${dataset.reservoirs.length}`);
};

run().catch((error) => {
  console.error('Falha ao gerar mock seed de monitoramento:', error);
  process.exitCode = 1;
});
