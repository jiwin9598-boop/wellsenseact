import React from 'react';

/**
 * StatusCard displays high-level system status in clear, plain language.
 * Props:
 *  - hasAlert: boolean indicating whether active/unchecked alerts exist
 *  - alertCount: optional number of active alerts
 */
export function StatusCard({ hasAlert = false, alertCount = 0 }) {
  return (
    <section
      aria-label="Overall Well Status"
      className="card"
      style={{
        borderLeft: `6px solid ${hasAlert ? 'var(--color-red)' : 'var(--color-green)'}`,
        backgroundColor: hasAlert ? 'var(--color-surface)' : 'var(--color-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        marginBottom: '20px',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: hasAlert ? 'var(--color-red-bg)' : 'var(--color-green-bg)',
            color: hasAlert ? 'var(--color-red-text)' : 'var(--color-green-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {hasAlert ? '⚠' : '✓'}
        </div>
        <div>
          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              color: hasAlert ? 'var(--color-red)' : 'var(--color-green)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {hasAlert ? 'Check your well ⚠' : 'All normal ✓'}
          </h2>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '0.9rem',
              color: 'var(--color-text-muted)',
            }}
          >
            {hasAlert
              ? `${alertCount > 0 ? alertCount : 'One or more'} reading${alertCount === 1 ? '' : 's'} shifted outside regular patterns.`
              : 'Sensors report readings inside expected ranges.'}
          </p>
        </div>
      </div>
    </section>
  );
}

export default StatusCard;
