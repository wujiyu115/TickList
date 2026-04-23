import React from 'react';
import './DragIndicator.less';

interface DragIndicatorProps {
  position: 'top' | 'bottom';
  type: 'sibling' | 'child';
  depth?: number; // 目标任务的缩进层级
}

const DragIndicator: React.FC<DragIndicatorProps> = ({ position, type, depth = 0 }) => {
  const className = [
    'drag-indicator',
    position === 'top' ? 'drag-indicator-top' : 'drag-indicator-bottom',
  ]
    .filter(Boolean)
    .join(' ');

  // 同级：与目标任务对齐；子任务：比目标任务再缩进一层
  const indentDepth = type === 'child' ? depth + 1 : depth;
  const paddingOffset = indentDepth * 24 + 12;

  return (
    <div className={className} style={{ paddingLeft: `${paddingOffset}px` }}>
      <div className="drag-indicator-dot" />
      <div className="drag-indicator-line" />
    </div>
  );
};

export default DragIndicator;
