import React, { createContext, useContext, useState, useCallback } from 'react';

export interface DragSource {
  taskId: string;
  parentId?: string; // 子任务的父任务 ID，顶级任务为 undefined
  index: number; // 在当前列表中的索引
}

export interface DragTarget {
  taskId: string;
  index: number;
  position: 'above' | 'below';
  type: 'sibling' | 'child';
}

interface DragContextValue {
  dragSource: DragSource | null;
  dragTarget: DragTarget | null;
  dragStartX: number;
  dragging: boolean;
  setDragSource: (source: DragSource | null) => void;
  setDragTarget: (target: DragTarget | null) => void;
  setDragStartX: (x: number) => void;
  clearDrag: () => void;
}

const DragContext = createContext<DragContextValue | null>(null);

export const DragProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);

  const clearDrag = useCallback(() => {
    setDragSource(null);
    setDragTarget(null);
    setDragStartX(0);
  }, []);

  return (
    <DragContext.Provider
      value={{
        dragSource,
        dragTarget,
        dragStartX,
        dragging: dragSource !== null,
        setDragSource,
        setDragTarget,
        setDragStartX,
        clearDrag,
      }}
    >
      {children}
    </DragContext.Provider>
  );
};

export const useDragContext = (): DragContextValue => {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDragContext must be used within a DragProvider');
  }
  return context;
};

export default DragContext;
