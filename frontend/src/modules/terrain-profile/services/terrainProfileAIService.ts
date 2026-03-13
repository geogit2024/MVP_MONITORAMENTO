import type { TerrainProfileAIRequest, TerrainProfileAIResponse } from '../types'

interface RequestTerrainProfileInterpretationInput {
  apiBaseUrl: string
  payload: TerrainProfileAIRequest
  signal?: AbortSignal
}

export const requestTerrainProfileInterpretation = async ({
  apiBaseUrl,
  payload,
  signal,
}: RequestTerrainProfileInterpretationInput): Promise<TerrainProfileAIResponse> => {
  const response = await fetch(`${apiBaseUrl}/analysis/terrain-profile/interpret`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Falha ao interpretar perfil por IA: ${response.status}${detail ? ` - ${detail}` : ''}`,
    )
  }

  const data = (await response.json()) as Partial<TerrainProfileAIResponse>
  if (!data.description || typeof data.description !== 'string') {
    throw new Error('Resposta da IA sem descricao valida para o perfil do terreno.')
  }

  return {
    description: data.description,
    source: data.source === 'openai' ? 'openai' : 'heuristic',
  }
}
