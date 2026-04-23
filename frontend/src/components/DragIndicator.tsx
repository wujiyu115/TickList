import React from 'react';
import './DragIndicator.less';

interface DragIndicatorProps {
  position: 'top' | 'bottom';
  type: 'sibling' | 'child';
}

const DragIndicator: React.FC<DragIndicatorProps> = ({ position, type }) => {
  const className = [
    'drag-indicator',
    position === 'top' ? 'drag-indicator-top' : 'drag-indicator-bottom',
    type === 'child' ? 'drag-indicator-child' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <div className="drag-indicator-dot" />
      <div className="drag-indicator-line" />
    </div>
  );
};

export default DragIndicator;
