import React, { useState } from 'react';

export const MiniPieChart: React.FC<{
  current: number;
  total: number;
  valueDisplayStyle?: 'percentage' | 'count';
  customDisplay?: (current: number, total: number) => string;
  size?: number;
  arcColor?: string;
  className?: string;
}> = ({
  current,
  total,
  valueDisplayStyle = 'count',
  customDisplay,
  size = 16,
  arcColor = 'currentColor',
  className,
}) => {
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Calculate the percentage and angle
  const percentage = !total ? 0 : Math.min((current / total) * 100, 100);
  
  // Calculate the SVG arc path for different percentages
  const getArcPath = (percentage: number) => {
    const angle = (percentage / 100) * 360;
    
    // For complete circle
    if (angle >= 360) {
      return `M ${center},${center} m -${radius},0 a ${radius},${radius} 0 1,1 ${radius * 2},0 a ${radius},${radius} 0 1,1 -${radius * 2},0`;
    }

    // Calculate start and end points
    const startAngle = -90; // Start from top
    const endAngle = angle - 90;

    // Convert to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // Calculate points
    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    // Single arc command
    return `
            M ${x1} ${y1}
            A ${radius} ${radius} 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2}
            L ${center} ${center}
            L ${x1} ${y1}
        `
      .trim()
      .replace(/\s+/g, ' ');
  };

  // Generate paths for 0%, 25%, 50%, 75%, and 100% to use in CSS interpolation
  const emptyPath = getArcPath(0);
  const path25 = getArcPath(25);
  const path50 = getArcPath(50);
  const path75 = getArcPath(75);
  const fullPath = getArcPath(100);
  
  // Current path based on actual percentage
  const currentPath = getArcPath(percentage);

  const getCaptureRate = (current: number, total: number) => {
    if (customDisplay) {
      return customDisplay(current, total);
    }
    if (valueDisplayStyle === 'percentage') {
      return `${Math.round((current / total) * 100)}%`;
    }
    const padLength = total.toString().length;
    return `${current.toString().padStart(padLength, '0')}/${total}`;
  };

  // Generate a unique ID for this instance
  const [uniqueId] = useState(() => `pie-chart-${Math.random().toString(36).substring(2, 9)}`);

  return (
    <div className={`MiniPieChart flex items-center gap-2 ${className || ''}`}>
      <style jsx>{`
        .pie-container-${uniqueId} {
          --progress: ${percentage / 100};
        }
        
        .pie-path-${uniqueId} {
          d: path('${currentPath}');
        }
        
        /* Use parent's CSS variable if available */
        .pie-container-${uniqueId}.use-parent-progress .pie-path-${uniqueId} {
          d: path(${emptyPath});
          d: path(calc((1 - var(--progress, 0)) * ${emptyPath} + 
                      var(--progress, 0) * ${fullPath}));
        }
      `}</style>
      
      <div className={`pie-container-${uniqueId} ${className?.includes('timer-animated') ? 'use-parent-progress' : ''}`}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={arcColor}
            strokeWidth={strokeWidth}
          />
          {/* CSS animated progress arc */}
          <path 
            className={`pie-path-${uniqueId}`}
            fill={arcColor} 
          />
        </svg>
      </div>
      
      <span className="text-sm font-mono">{getCaptureRate(current, total)}</span>
    </div>
  );
}; 