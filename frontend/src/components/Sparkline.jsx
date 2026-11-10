import React, { useRef, useEffect } from 'react';

function colorWithOpacity(color, opacity) {
  const match = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return color;

  const hex = match[1].length === 3
    ? [...match[1]].map((digit) => digit + digit).join('')
    : match[1];
  const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${channels.join(', ')}, ${opacity})`;
}

/**
 * High-performance canvas-based sparkline.
 * Props:
 *  - data: Array of numbers
 *  - color: Line stroke color (default: teal #0b7a75)
 *  - width: display width in pixels (default: 120)
 *  - height: display height in pixels (default: 36)
 */
export function Sparkline({
  data = [],
  color = '#0b7a75',
  width = 120,
  height = 36,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssVariable = color.match(/^var\((--[^)]+)\)$/);
    const resolvedColor = cssVariable
      ? getComputedStyle(canvas).getPropertyValue(cssVariable[1]).trim()
      : color;
    ctx.fillStyle = resolvedColor;
    const canvasColor = ctx.fillStyle;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!data || data.length < 2) {
      // Draw flat baseline if not enough data
      ctx.beginPath();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const numericData = data.map((v) => (typeof v === 'number' && !isNaN(v) ? v : 0));
    const minVal = Math.min(...numericData);
    const maxVal = Math.max(...numericData);
    const range = maxVal - minVal || 1;

    const paddingY = 4;
    const drawHeight = height - paddingY * 2;
    const stepX = width / (numericData.length - 1);

    const points = numericData.map((val, i) => {
      const x = i * stepX;
      const normalized = (val - minVal) / range;
      // Invert Y since 0 is top
      const y = paddingY + drawHeight * (1 - normalized);
      return { x, y };
    });

    // Fill gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, colorWithOpacity(canvasColor, 0.26));
    gradient.addColorStop(1, colorWithOpacity(canvasColor, 0));

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.lineTo(points[0].x, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw main stroke
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = canvasColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // End dot
    const lastPoint = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = canvasColor;
    ctx.fill();
  }, [data, color, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
}

export default Sparkline;
