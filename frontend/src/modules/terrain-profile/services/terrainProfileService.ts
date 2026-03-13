import { Cartographic, EllipsoidGeodesic, type Viewer } from 'cesium'
import type { TerrainProfileAnalysisResult, TerrainProfileAIRequest } from '../types'
import { buildTerrainProfileAnalysis } from '../utils/terrainProfileClassification'
import { buildHeuristicTerrainDescription } from '../utils/terrainProfileFormatter'
import { sampleTerrainProfileLine } from '../utils/terrainProfileSampling'
import { requestTerrainProfileInterpretation } from './terrainProfileAIService'

export interface GenerateTerrainProfileAnalysisInput {
  viewer: Viewer
  startCartographic: Cartographic
  endCartographic: Cartographic
  apiBaseUrl: string
  signal?: AbortSignal
  preferredSampleCount?: number
}

const MIN_PROFILE_LENGTH_METERS = 20
const MAX_PROFILE_LENGTH_METERS = 300000

const validateProfileLine = (startCartographic: Cartographic, endCartographic: Cartographic) => {
  const geodesic = new EllipsoidGeodesic(startCartographic, endCartographic)
  const lineLengthMeters = geodesic.surfaceDistance || 0

  if (lineLengthMeters < MIN_PROFILE_LENGTH_METERS) {
    throw new Error(
      `A linha do perfil e muito curta. Use ao menos ${MIN_PROFILE_LENGTH_METERS} metros.`,
    )
  }

  if (lineLengthMeters > MAX_PROFILE_LENGTH_METERS) {
    throw new Error(
      `A linha do perfil excede o limite de ${Math.round(MAX_PROFILE_LENGTH_METERS / 1000)} km.`,
    )
  }

  return lineLengthMeters
}

const buildAiPayload = (
  analysisWithoutAi: Omit<TerrainProfileAnalysisResult, 'aiDescription'>,
): TerrainProfileAIRequest => ({
  summary: analysisWithoutAi.summary,
  segments: analysisWithoutAi.segments.slice(0, 140),
})

export const generateTerrainProfileAnalysis = async ({
  viewer,
  startCartographic,
  endCartographic,
  apiBaseUrl,
  signal,
  preferredSampleCount,
}: GenerateTerrainProfileAnalysisInput): Promise<TerrainProfileAnalysisResult> => {
  validateProfileLine(startCartographic, endCartographic)
  if (!viewer.terrainProvider) {
    throw new Error('Terrain provider indisponivel para gerar o perfil do terreno.')
  }

  const samplingResult = await sampleTerrainProfileLine({
    terrainProvider: viewer.terrainProvider,
    start: startCartographic,
    end: endCartographic,
    preferredSampleCount,
  })

  if (samplingResult.points.length < 2) {
    throw new Error('Nao foi possivel amostrar pontos suficientes no terreno.')
  }

  const analysisWithoutAi = buildTerrainProfileAnalysis(samplingResult.points)
  if (samplingResult.invalidElevationCount > 0) {
    analysisWithoutAi.warnings.push(
      `${samplingResult.invalidElevationCount} amostras sem elevacao valida foram interpoladas automaticamente.`,
    )
  }

  let aiDescription = buildHeuristicTerrainDescription(
    analysisWithoutAi.summary,
    analysisWithoutAi.segments,
  )
  try {
    const aiResponse = await requestTerrainProfileInterpretation({
      apiBaseUrl,
      payload: buildAiPayload(analysisWithoutAi),
      signal,
    })
    if (aiResponse.description.trim()) {
      aiDescription = aiResponse.description.trim()
    }
  } catch (_error) {
    analysisWithoutAi.warnings.push('Interpretacao por IA indisponivel. Foi aplicada descricao heuristica.')
  }

  return {
    ...analysisWithoutAi,
    aiDescription,
  }
}
