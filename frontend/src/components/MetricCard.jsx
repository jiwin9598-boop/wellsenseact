import React, { useEffect, useState } from 'react';
import Sparkline from './Sparkline.jsx';

/**
 * MetricCard displays an individual water quality measurement with animated value,
 * sparkline history, and contextual reference guidelines.
 *
 * Props:
 *  - label: string (e.g. 'pH Level', 'Cloudiness', 'Dissolved Minerals')
 *  - value: number | string (current numeric reading)
 *  - unit: string (e.g. 'NTU', 'ppm')
 *  - reference: string (e.g. '6.5 – 8.5', '< 5 NTU')
 *  - sparkData: Array<number> (last 12 readings)
 *  - alertLevel: 'normal' | 'warning' | 'alert'
 */
export function MetricCard({
  label,
  value,
  unit = '',
  reference = '',
  sparkData = [],
  alertLevel = 'normal',
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setDisplayValue(value);
    setAnimKey((prev) => prev + 1);
  }, [value]);

  let statusColor = 'var(--color-teal)';
  let badgeBg = 'var(--color-teal-soft)';
  let badgeText = 'var(--color-teal)';
  let badgeLabel = 'Expected';

  if (alertLevel === 'alert') {
    statusColor = 'var(--color-red)';
    badgeBg = 'var(--color-red-bg)';
    badgeText = 'var(--color-red-text)';
    badgeLabel = 'Outside range';
  } else if (alertLevel === 'warning') {
    statusColor = 'var(--color-amber)';
    badgeBg = 'var(--color-amber-bg)';
    badgeText = 'var(--color-amber-text)';
    badgeLabel = 'Shift detected';
  }

  const formattedValue =
    typeof displayValue === 'number'
      ? Number.isInteger(displayValue)
        ? displayValue.toString()
        : displayValue.toFixed(displayValue < 10 ? 2 : 1)
      : displayValue ?? '--';

  return (
    <article
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        minHeight: '170px',
      }}
      aria-label={`${label}: ${formattedValue} ${unit}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <h3
            style={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              margin: 0,
            }}
          >
            {label}
          </h3>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: badgeBg,
              color: badgeText,
              display: 'inline-block',
              marginTop: '4px',
            }}
          >
            {badgeLabel}
          </span>
        </div>

        <div style={{ alignSelf: 'center' }}>
          <Sparkline data={sparkData} color={statusColor} width={90} height={32} />
        </div>
      </div>

      <div style={{ margin: '8px 0 12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span
            key={animKey}
            className="number-tick"
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              color: 'var(--color-text)',
              lineHeight: 1,
            }}
          >
            {formattedValue}
          </span>
          {unit && (
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--color-text-muted)',
              }}
            >
              {unit}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--color-surface-border)',
          paddingTop: '8px',
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
        }}
      >
        <span>Guideline target:</span>
        <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{reference}</strong>
      </div>
    </article>
  );
}

export default MetricCard;
