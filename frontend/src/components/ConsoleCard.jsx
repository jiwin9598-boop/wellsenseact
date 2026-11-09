import React from 'react';

/**
 * Formats timestamp into friendly relative time string (e.g. '5 min ago').
 */
function formatRelativeTime(ts) {
  if (!ts) return 'Never';
  const now = Date.now();
  const time = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diffSec = Math.floor((now - time) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins} min${mins === 1 ? '' : 's'} ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(diffSec / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Returns battery display color and icon.
 */
function getBatteryDisplay(battery) {
  const level = typeof battery === 'number' ? Math.round(battery) : null;
  if (level === null) {
    return { text: '--', color: 'var(--color-text-muted)', icon: '🔋' };
  }
  if (level > 60) {
    return { text: `${level}%`, color: 'var(--color-green)', icon: '🔋' };
  }
  if (level > 20) {
    return { text: `${level}%`, color: 'var(--color-amber)', icon: '🪫' };
  }
  return { text: `${level}%`, color: 'var(--color-red)', icon: '🪫' };
}

/**
 * ConsoleCard displays console status, battery, and optional switcher.
 *
 * Props:
 *  - consoleData: { id, name, battery, lastSeen, created_at }
 *  - consoles: Array of consoles
 *  - onSelectConsole: (id: string | number) => void
 */
export function ConsoleCard({
  consoleData,
  consoles = [],
  onSelectConsole,
}) {
  const activeConsole = consoleData || consoles[0] || { name: 'Main Well Console', battery: 92, lastSeen: Date.now() };
  const batteryInfo = getBatteryDisplay(activeConsole.battery);

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '16px 20px',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: 'var(--color-teal-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            color: 'var(--color-teal)',
          }}
          aria-hidden="true"
        >
          📡
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            Active Well Station
          </div>
          {consoles.length > 1 ? (
            <select
              value={activeConsole.id}
              onChange={(e) => onSelectConsole && onSelectConsole(e.target.value)}
              aria-label="Select monitoring console"
              style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                padding: '4px 8px',
                border: '1px solid var(--color-surface-border)',
                borderRadius: '6px',
                marginTop: '2px',
                width: 'auto',
                minHeight: '36px',
              }}
            >
              {consoles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)' }}>
              {activeConsole.name || 'Well Console'}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Battery indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>
            {batteryInfo.icon}
          </span>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Battery</div>
            <strong style={{ fontSize: '0.95rem', color: batteryInfo.color }}>
              {batteryInfo.text}
            </strong>
          </div>
        </div>

        {/* Last seen indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span aria-hidden="true" style={{ fontSize: '1.1rem', color: 'var(--color-teal)' }}>
            ⏱
          </span>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Last update</div>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {formatRelativeTime(activeConsole.lastSeen)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConsoleCard;
