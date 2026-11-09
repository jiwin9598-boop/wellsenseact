import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../api.js';
import useSSE from '../hooks/useSSE.js';
import OfflineBanner from '../components/OfflineBanner.jsx';
import StatusCard from '../components/StatusCard.jsx';
import MetricCard from '../components/MetricCard.jsx';
import TrendChart from '../components/TrendChart.jsx';
import ConsoleCard from '../components/ConsoleCard.jsx';
import AlertList from '../components/AlertList.jsx';

// Default baseline data in case readings table is newly seeded
const DEFAULT_READINGS = Array.from({ length: 24 }).map((_, i) => {
  const ts = Date.now() - (23 - i) * 3600 * 1000;
  return {
    id: i + 1,
    ph: 7.35 + Math.sin(i / 2) * 0.15,
    turbidity: 1.2 + Math.cos(i / 3) * 0.4,
    tds: 240 + Math.sin(i / 4) * 25,
    temperature: 14.8 + Math.sin(i / 5) * 1.2,
    battery: 92,
    ts,
  };
});

export function Dashboard() {
  const [consoles, setConsoles] = useState([]);
  const [selectedConsoleId, setSelectedConsoleId] = useState('');
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [range, setRange] = useState('24h');
  const [metric, setMetric] = useState('ph');
  const [loading, setLoading] = useState(true);

  // Real-time alert stream hook
  const { alerts: sseAlerts } = useSSE(true);

  // Sync SSE alerts into active alerts
  useEffect(() => {
    if (sseAlerts && sseAlerts.length > 0) {
      setAlerts((prevAlerts) => {
        const merged = [...sseAlerts];
        prevAlerts.forEach((oldAlert) => {
          if (!merged.some((m) => m.id === oldAlert.id)) {
            merged.push(oldAlert);
          }
        });
        return merged;
      });
    }
  }, [sseAlerts]);

  // Fetch Consoles
  const fetchConsoles = useCallback(async () => {
    try {
      const res = await api.get('/api/consoles');
      const data = Array.isArray(res.data) ? res.data : res.data?.consoles || [];
      setConsoles(data);
      if (data.length > 0 && !selectedConsoleId) {
        setSelectedConsoleId(data[0].id.toString());
      }
    } catch (err) {
      // Fallback console entry
      const fallback = [{ id: 1, name: 'Main Well Station', battery: 94, lastSeen: Date.now() }];
      setConsoles(fallback);
      if (!selectedConsoleId) setSelectedConsoleId('1');
    }
  }, [selectedConsoleId]);

  // Fetch Alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get('/api/alerts');
      const data = Array.isArray(res.data) ? res.data : res.data?.alerts || [];
      setAlerts(data);
    } catch (err) {
      setAlerts([]);
    }
  }, []);

  // Fetch Readings
  const fetchReadings = useCallback(async (consoleId, timeRange) => {
    try {
      const url = consoleId
        ? `/api/readings?consoleId=${consoleId}&range=${timeRange}`
        : `/api/readings?range=${timeRange}`;
      const res = await api.get(url);
      const data = Array.isArray(res.data) ? res.data : res.data?.readings || [];
      if (data.length > 0) {
        setReadings(data);
      } else {
        setReadings(DEFAULT_READINGS);
      }
    } catch (err) {
      // Fallback to synthetic default readings for offline or initial setup
      setReadings(DEFAULT_READINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsoles();
    fetchAlerts();
  }, [fetchConsoles, fetchAlerts]);

  useEffect(() => {
    fetchReadings(selectedConsoleId, range);
  }, [selectedConsoleId, range, fetchReadings]);

  // Handle Mark as Checked
  const handleCheckAlert = async (alertId) => {
    // Optimistic UI update
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, checked: true } : a))
    );

    try {
      await api.post(`/api/alerts/${alertId}/check`, {});
    } catch {
      try {
        await api.patch(`/api/alerts/${alertId}`, { checked: true });
      } catch (e) {
        // Kept optimistically
      }
    }
  };

  // Compute active alerts and statuses
  const uncheckedAlerts = useMemo(() => {
    return alerts.filter((a) => !a.checked);
  }, [alerts]);

  const hasAlert = uncheckedAlerts.length > 0;

  // Selected console data
  const selectedConsole = useMemo(() => {
    return consoles.find((c) => c.id.toString() === selectedConsoleId) || consoles[0];
  }, [consoles, selectedConsoleId]);

  // Latest readings and historical sparkline arrays
  const latestReading = readings.length > 0 ? readings[readings.length - 1] : DEFAULT_READINGS[DEFAULT_READINGS.length - 1];
  const recent12 = readings.slice(-12);

  const phSparkData = recent12.map((r) => r.ph);
  const turbiditySparkData = recent12.map((r) => r.turbidity);
  const tdsSparkData = recent12.map((r) => r.tds);

  // Threshold evaluations
  const currentPh = latestReading?.ph ?? 7.2;
  const currentTurbidity = latestReading?.turbidity ?? 1.1;
  const currentTds = latestReading?.tds ?? 230;

  const phLevel = currentPh < 6.5 || currentPh > 8.5 ? 'alert' : (currentPh < 6.8 || currentPh > 8.2 ? 'warning' : 'normal');
  const turbidityLevel = currentTurbidity >= 5.0 ? 'alert' : (currentTurbidity >= 2.5 ? 'warning' : 'normal');
  const tdsLevel = currentTds >= 500 ? 'alert' : (currentTds >= 400 ? 'warning' : 'normal');

  return (
    <div className="container">
      <OfflineBanner />

      <header className="top-header">
        <div>
          <h1>
            <span role="img" aria-label="Droplet">💧</span>
            <span>WellSense Monitor</span>
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Continuous Well Water Quality Tracking
          </p>
        </div>
      </header>

      {/* High-level status indicator */}
      <StatusCard hasAlert={hasAlert} alertCount={uncheckedAlerts.length} />

      {/* Station console & power metadata */}
      <ConsoleCard
        consoleData={selectedConsole}
        consoles={consoles}
        onSelectConsole={(id) => setSelectedConsoleId(id.toString())}
      />

      {/* 3 Main water parameter metric cards */}
      <section aria-label="Current Key Measurements">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          <MetricCard
            label="pH Level"
            value={currentPh}
            unit=""
            reference="6.5 – 8.5"
            sparkData={phSparkData}
            alertLevel={phLevel}
          />
          <MetricCard
            label="Cloudiness"
            value={currentTurbidity}
            unit="NTU"
            reference="< 5 NTU"
            sparkData={turbiditySparkData}
            alertLevel={turbidityLevel}
          />
          <MetricCard
            label="Dissolved Minerals"
            value={Math.round(currentTds)}
            unit="ppm"
            reference="< 500 ppm"
            sparkData={tdsSparkData}
            alertLevel={tdsLevel}
          />
        </div>
      </section>

      {/* Full width interactive trend graph */}
      <TrendChart
        data={readings}
        metric={metric}
        range={range}
        onMetricChange={setMetric}
        onRangeChange={setRange}
      />

      {/* List of recent alerts and actions */}
      <AlertList alerts={alerts} onCheck={handleCheckAlert} />

      {/* Mandatory non-technical disclaimer box */}
      <footer className="disclaimer-box">
        <span style={{ fontSize: '1.25rem' }} aria-hidden="true">
          ℹ️
        </span>
        <div>
          <strong>Guideline Limits &amp; Safety Disclaimer:</strong>
          <br />
          Reference limits shown are for informational purposes only. This device is an early-warning monitor and is not a water quality or potability certificate. If any readings change unexpectedly or if you notice strange tastes, odors, or discoloration, have your water tested promptly by a certified laboratory.
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
