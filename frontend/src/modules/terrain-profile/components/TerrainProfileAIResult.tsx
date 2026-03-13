import React from 'react'

interface TerrainProfileAIResultProps {
  description: string
  warnings?: string[]
}

export const TerrainProfileAIResult: React.FC<TerrainProfileAIResultProps> = ({
  description,
  warnings = [],
}) => (
  <div className="terrain-profile-ai-result">
    <h5>Interpretacao Tecnica (IA)</h5>
    <p>{description}</p>
    {warnings.length > 0 && (
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    )}
  </div>
)

export default TerrainProfileAIResult
