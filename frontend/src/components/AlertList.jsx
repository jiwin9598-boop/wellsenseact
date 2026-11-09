import React from 'react';

function formatAlertTime(ts) {
  if (!ts) return '';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(Date.parse(ts));
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * AlertList displays active and historic water alerts.
 *
 * Props:
 *  - alerts: Array<{ id, message, severity, created_at, ts, checked }>
 *  - onCheck: (id: string | number) => void
 */
export function AlertList({ alerts = [], onCheck }) {
  if (!alerts || alerts.length === 0) {
    return (
      <section className="card" style={{ marginTop: '20px', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '8px' }} aria-hidden="true">
          ✨
        </div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 4px 0' }}>
          No Active Alerts
        </h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
          Readings are steady. We will notify you here if shifts or unusual spikes are detected.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Recent Water Quality Alerts" style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
          Recent Well Notices ({alerts.length})
        </h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          Review and acknowledge
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {alerts.map((alert) => {
          const isChecked = Boolean(alert.checked);
          const isUrgent = alert.severity === 'danger' || alert.severity === 'high';

          return (
            <div
              key={alert.id}
              className={`card ${isChecked ? '' : 'border-beam'}`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '16px',
                opacity: isChecked ? 0.65 : 1,
                borderLeft: isChecked
                  ? '4px solid var(--color-surface-border)'
                  : isUrgent
                  ? '4px solid var(--color-red)'
                  : '4px solid var(--color-amber)',
                transition: 'opacity 0.2s ease, transform 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: '1 1 240px' }}>
                <span
                  style={{
                    fontSize: '1.25rem',
                    lineHeight: 1,
                    marginTop: '2px',
                  }}
                  aria-hidden="true"
                >
                  {isChecked ? '✅' : isUrgent ? '🚨' : '⚠️'}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: 'var(--color-text)',
                      lineHeight: 1.35,
                    }}
                  >
                    {alert.message || 'Water quality parameter deviation detected.'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--color-text-muted)',
                      marginTop: '4px',
                    }}
                  >
                    {formatAlertTime(alert.created_at || alert.ts)}
                    {isChecked && ' • Acknowledged'}
                  </div>
                </div>
              </div>

              <div>
                {!isChecked ? (
                  <button
                    type="button"
                    onClick={() => onCheck && onCheck(alert.id)}
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.85rem',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      minHeight: '44px',
                    }}
                    aria-label={`Mark notice as checked: ${alert.message}`}
                  >
                    Mark as checked
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                      padding: '8px 12px',
                      display: 'inline-block',
                    }}
                  >
                    ✓ Checked
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default AlertList;
