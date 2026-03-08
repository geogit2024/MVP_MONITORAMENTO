import React from 'react';
import type { LandCoverClassDef } from './types';

interface ClassSelectorProps {
  classes: LandCoverClassDef[];
  selectedClassId: number | null;
  onSelectedClassChange: (classId: number) => void;
  onClassesChange: (classes: LandCoverClassDef[]) => void;
}

export default function ClassSelector({
  classes,
  selectedClassId,
  onSelectedClassChange,
  onClassesChange,
}: ClassSelectorProps) {
  const handleClassField = (
    classId: number,
    field: keyof Pick<LandCoverClassDef, 'name' | 'color'>,
    value: string
  ) => {
    onClassesChange(classes.map((c) => (c.id === classId ? { ...c, [field]: value } : c)));
  };

  const handleAddClass = () => {
    const nextId = classes.length ? Math.max(...classes.map((c) => c.id)) + 1 : 1;
    const next = [...classes, { id: nextId, name: `Classe ${nextId}`, color: '#999999' }];
    onClassesChange(next);
    onSelectedClassChange(nextId);
  };

  const handleRemoveClass = (classId: number) => {
    const next = classes.filter((c) => c.id !== classId);
    onClassesChange(next);
    if (selectedClassId === classId && next.length) {
      onSelectedClassChange(next[0].id);
    }
  };

  return (
    <div className="landcover-card">
      <div className="landcover-title-row">
        <strong>Classes</strong>
        <button type="button" className="button button-secondary" onClick={handleAddClass}>
          + Classe
        </button>
      </div>
      <div className="landcover-class-list">
        {classes.map((cls) => (
          <div
            key={cls.id}
            className={`landcover-class-item ${selectedClassId === cls.id ? 'active' : ''}`}
            onClick={() => onSelectedClassChange(cls.id)}
          >
            <input
              type="color"
              value={cls.color}
              onChange={(e) => handleClassField(cls.id, 'color', e.target.value)}
              title="Cor da classe"
            />
            <input
              type="text"
              value={cls.name}
              onChange={(e) => handleClassField(cls.id, 'name', e.target.value)}
            />
            <span className="landcover-class-id">#{cls.id}</span>
            {classes.length > 1 && (
              <button
                type="button"
                className="landcover-remove-class"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveClass(cls.id);
                }}
              >
                x
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
