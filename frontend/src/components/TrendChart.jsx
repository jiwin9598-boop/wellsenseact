import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const METRIC_CONFIG = {
  ph: {
    label: 'pH Level',
    unit: '',
    color: '#0b7a75',
    colorFill: 'rgba(11, 122, 117, 0.15)',
    decimals: 2,
  },
  turbidity: {
    label: 'Cloudiness',
    unit: 'NTU',
    color: '#0fa29c',
    colorFill: 'rgba(15, 162, 156, 0.15)',
    decimals: 1,
  },
  tds: {
    label: 'Dissolved Minerals',
    unit: 'ppm',
    color: '#f59e0b',
    colorFill: 'rgba(245, 158, 11, 0.15)',
    decimals: 0,
  },
  temperature: {
    label: 'Temperature',
    unit: '°C',
    color: '#3b82f6',
    colorFill: 'rgba(59, 130, 246, 0.15)',
    decimals: 1,
  },
};

/**
 * TrendChart displays historical water readings with customizable metric and range.
 *
 * Props:
 *  - data: Array of { ts, ph, turbidity, tds, temperature }
 *  - metric: 'ph' | 'turbidity' | 'tds' | 'temperature'
 *  - range: '24h' | '7d' | '30d'
 *  - onMetricChange: (metric: string) => void
 *  - onRangeChange: (range: string) => void
 */
export function TrendChart({
  data = [],
  metric = 'ph',
  range = '24h',
  onMetricChange,
  onRangeChange,
}) {
  const currentMetricKey = (metric in METRIC_CONFIG) ? metric : 'ph';
  const metricInfo = METRIC_CONFIG[currentMetricKey];

  // Format labels based on range
  const labels = data.map((item) => {
    const date = new Date(item.ts || item.created_at || Date.now());
    if (range === '24h') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  });

  const values = data.map((item) => {
    const val = item[currentMetricKey];
    return typeof val === 'number' ? Number(val.toFixed(metricInfo.decimals)) : null;
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: `${metricInfo.label} ${metricInfo.unit ? `(${metricInfo.unit})` : ''}`,
        data: values,
        borderColor: metricInfo.color,
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 280);
          gradient.addColorStop(0, metricInfo.colorFill);
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          return gradient;
        },
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: values.length > 25 ? 0 : 3.5,
        pointHoverRadius: 6,
        pointBackgroundColor: metricInfo.color,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#0c1a22',
        titleColor: '#f1f5f9',
        bodyColor: '#f1f5f9',
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const val = context.parsed.y;
            return `${metricInfo.label}: ${val} ${metricInfo.unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: 7,
          color: '#94a3b8',
          font: { size: 11 },
        },
      },
      y: {
        grid: {
          color: 'rgba(148, 163, 184, 0.15)',
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 11 },
        },
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

  return (
    <section className="card" style={{ marginTop: '20px', padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
            Trend History
          </h2>
          <select
            value={currentMetricKey}
            onChange={(e) => onMetricChange && onMetricChange(e.target.value)}
            aria-label="Select measurement to graph"
            style={{
              padding: '6px 12px',
              fontSize: '0.875rem',
              width: 'auto',
              borderRadius: '8px',
              minHeight: '40px',
            }}
          >
            <option value="ph">pH Level</option>
            <option value="turbidity">Cloudiness (Turbidity)</option>
            <option value="tds">Dissolved Minerals (TDS)</option>
            <option value="temperature">Water Temperature</option>
          </select>
        </div>

        <div
          role="group"
          aria-label="Time range selector"
          style={{
            display: 'inline-flex',
            backgroundColor: 'var(--color-bg)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          {['24h', '7d', '30d'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange && onRangeChange(r)}
              style={{
                minWidth: '48px',
                minHeight: '36px',
                padding: '4px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: range === r ? 'var(--color-teal)' : 'transparent',
                color: range === r ? '#ffffff' : 'var(--color-text-muted)',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: '260px', width: '100%', position: 'relative' }}>
        {data.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '0.9rem',
            }}
          >
            No sensor readings logged for this timeframe yet.
          </div>
        ) : (
          <Line data={chartData} options={chartOptions} />
        )}
      </div>
    </section>
  );
}

export default TrendChart;
