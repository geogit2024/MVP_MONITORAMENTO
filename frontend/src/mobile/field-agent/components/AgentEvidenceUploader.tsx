import React, { useState } from 'react';
import { fieldDispatchApi } from '../../../modules/field-dispatch/services/fieldDispatchApi';
import type { FieldEvidence, PointGeometry } from '../../../modules/field-dispatch/types';
import type { RequestContext } from '../../../modules/field-dispatch/services/fieldDispatchApi';

interface AgentEvidenceUploaderProps {
  taskId: number;
  context: RequestContext;
  currentPosition: PointGeometry | null;
  onUploaded: (evidence: FieldEvidence) => void;
}

export function AgentEvidenceUploader({
  taskId,
  context,
  currentPosition,
  onUploaded,
}: AgentEvidenceUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState('');
  const [working, setWorking] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setFeedback('Selecione um arquivo para envio.');
      return;
    }
    try {
      setWorking(true);
      setFeedback('');
      const upload = await fieldDispatchApi.uploadEvidenceFile(taskId, file, context);
      const created = await fieldDispatchApi.createEvidence(
        taskId,
        {
          type: 'photo',
          fileUrl: upload.fileUrl,
          description: description || undefined,
          geometry: currentPosition || undefined,
        },
        context
      );
      onUploaded(created);
      setFile(null);
      setDescription('');
      setFeedback('Evidência enviada com sucesso.');
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || 'Falha no envio de evidência.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mobile-card">
      <h3>Evidências de campo</h3>
      <label>
        Arquivo
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
      </label>
      <label>
        Observação
        <textarea
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Descreva a evidência coletada..."
        />
      </label>
      <button type="button" className="dispatch-button success" onClick={() => void handleUpload()} disabled={working}>
        {working ? 'Enviando...' : 'Enviar evidência'}
      </button>
      {feedback ? <p className="subtitle">{feedback}</p> : null}
    </div>
  );
}
