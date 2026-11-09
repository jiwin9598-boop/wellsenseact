import React from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus.js';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="offline-banner"
    >
      <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>⚠️</span>
      <span>You are offline. Showing last available data.</span>
    </div>
  );
}

export default OfflineBanner;
