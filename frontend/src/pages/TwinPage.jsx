import React, { useState, useEffect, useRef } from 'react';
import api from '../api.js';

/**
 * Calculates water surface color from turbidity (NTU).
 * 0 NTU: clear blue
 * 5 NTU: greenish
 * 50+ NTU: turbid brown
 */
function getWaterColor(turbidity) {
  const t = Math.max(0, typeof turbidity === 'number' ? turbidity : 1.2);
  if (t < 2) return '#38bdf8'; // Crystal clear blue
  if (t < 5) return '#2dd4bf'; // Clear blue-green
  if (t < 15) return '#84cc16'; // Greenish tint (algae/sediment start)
  if (t < 30) return '#d97706'; // Murky amber/tan
  return '#78350f'; // Heavy sediment brown
}

export function TwinPage({ turbidity: propTurbidity }) {
  const [turbidity, setTurbidity] = useState(propTurbidity ?? 1.2);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsWebXR, setSupportsWebXR] = useState(false);
  const containerRef = useRef(null);

  // Check WebXR capability
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.xr) {
      navigator.xr
        .isSessionSupported('immersive-vr')
        .then((supported) => setSupportsWebXR(supported))
        .catch(() => setSupportsWebXR(false));
    }
  }, []);

  // Fetch latest turbidity if not passed as prop
  useEffect(() => {
    if (typeof propTurbidity === 'number') {
      setTurbidity(propTurbidity);
      return;
    }

    api
      .get('/api/readings?range=24h')
      .then((res) => {
        const readings = Array.isArray(res.data) ? res.data : res.data?.readings;
        if (readings && readings.length > 0) {
          const last = readings[readings.length - 1];
          if (typeof last.turbidity === 'number') {
            setTurbidity(last.turbidity);
          }
        }
      })
      .catch(() => {
        // Fallback default
        setTurbidity(1.2);
      });
  }, [propTurbidity]);

  // Dynamically load A-Frame 1.5.0
  useEffect(() => {
    if (window.AFRAME) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://aframe.io/releases/1.5.0/aframe.min.js';
    script.async = true;
    script.onload = () => {
      setIsLoaded(true);
    };
    script.onerror = () => {
      console.error('Failed to load A-Frame script');
    };
    document.head.appendChild(script);

    return () => {
      // Keep script in head for performance if user navigates back
    };
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const waterColor = getWaterColor(turbidity);

  return (
    <div className="container">
      <header className="top-header">
        <div>
          <h1>🔮 3D Well Digital Twin</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Real-time physical visualization of well shaft, sensor pod, and water condition
          </p>
        </div>
      </header>

      {/* Turbidity condition info strip */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '14px 20px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: waterColor,
              border: '2px solid rgba(0,0,0,0.15)',
            }}
          />
          <div>
            <strong>Water Clarity: {turbidity.toFixed(1)} NTU</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
              {turbidity < 2 ? 'Clear' : turbidity < 5 ? 'Normal' : 'Turbid / Clouded'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem', padding: '6px 14px', minHeight: '40px' }}
          >
            {isFullscreen ? 'Exit Full Screen' : '⛶ Full Screen'}
          </button>
        </div>
      </div>

      {/* 3D Viewport Box */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: isFullscreen ? '100vh' : '460px',
          borderRadius: isFullscreen ? '0' : 'var(--radius-lg)',
          overflow: 'hidden',
          backgroundColor: '#0c1a22',
          border: isFullscreen ? 'none' : '1px solid var(--color-surface-border)',
        }}
      >
        {!isLoaded ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '2rem' }}>🔄</div>
            <div>Loading 3D Digital Twin environment...</div>
          </div>
        ) : (
          <a-scene
            embedded
            vr-mode-ui={supportsWebXR ? 'enabled: true' : 'enabled: false'}
            renderer="antialias: true; alpha: false; colorManagement: true;"
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
          >
            {/* Ambient & directional lighting */}
            <a-light type="ambient" color="#64748b" intensity="0.8"></a-light>
            <a-light type="directional" position="2 4 3" color="#ffffff" intensity="0.9"></a-light>
            <a-light type="point" position="0 1.5 -2.5" color="#0b7a75" intensity="0.4"></a-light>

            {/* Gradient Sky from navy to teal */}
            <a-sky color="#0c1a22"></a-sky>

            {/* Ground ring */}
            <a-ring
              position="0 0.01 -3"
              rotation="-90 0 0"
              radius-inner="1.5"
              radius-outer="10"
              color="#1e293b"
            ></a-ring>

            {/* Outer stone well cylinder */}
            <a-cylinder
              position="0 0.8 -3"
              radius="1.45"
              height="1.6"
              color="#475569"
              roughness="0.85"
              metalness="0.1"
              open-ended="false"
            ></a-cylinder>

            {/* Stone rim */}
            <a-torus
              position="0 1.6 -3"
              rotation="90 0 0"
              radius="1.42"
              radius-tubular="0.08"
              color="#334155"
              roughness="0.9"
            ></a-torus>

            {/* Water surface inside the well driven by turbidity */}
            <a-circle
              position="0 0.95 -3"
              rotation="-90 0 0"
              radius="1.38"
              color={waterColor}
              material="opacity: 0.88; transparent: true; roughness: 0.2; metalness: 0.3;"
              animation="property: position; to: 0 0.98 -3; dir: alternate; dur: 3200; loop: true; easing: easeInOutSine"
            ></a-circle>

            {/* Floating yellow sensor pod with bobbing animation */}
            <a-sphere
              position="0 1.05 -3"
              radius="0.16"
              color="#f59e0b"
              material="roughness: 0.3; metalness: 0.4;"
              animation="property: position; to: 0 1.15 -3; dir: alternate; dur: 2200; loop: true; easing: easeInOutSine"
            >
              {/* Sensor pod antenna / led */}
              <a-cylinder position="0 0.16 0" radius="0.02" height="0.1" color="#0b7a75"></a-cylinder>
            </a-sphere>

            {/* Sensor cable connecting pod to wellhead rim */}
            <a-cylinder
              position="0.4 1.35 -3"
              rotation="0 0 35"
              radius="0.012"
              height="1.15"
              color="#0f172a"
            ></a-cylinder>

            {/* Camera & controls */}
            <a-entity
              camera
              look-controls="reverseMouseDrag: true"
              orbit-controls="target: 0 1 -3; minDistance: 1.5; maxDistance: 8; initialPosition: 0 2.2 -0.8"
            ></a-entity>
          </a-scene>
        )}
      </div>

      {/* WebXR status banner */}
      <div
        style={{
          marginTop: '12px',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: 'var(--color-text-muted)',
        }}
      >
        {supportsWebXR
          ? '🥽 VR / AR view active: tap the goggles icon inside the 3D view.'
          : 'VR/AR view available on supported devices.'}
      </div>

      <div className="disclaimer-box" style={{ marginTop: '20px' }}>
        <span style={{ fontSize: '1.2rem' }} aria-hidden="true">
          ℹ️
        </span>
        <div>
          <strong>Digital Twin Simulation:</strong>
          <br />
          The water color and sensor pod telemetry are generated based on real-time probe readings. WellSense is an early-warning system and does not certify potability.
        </div>
      </div>
    </div>
  );
}

export default TwinPage;
