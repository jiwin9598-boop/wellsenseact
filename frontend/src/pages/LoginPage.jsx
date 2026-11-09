import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLockout, setIsLockout] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLockout(false);

    if (!username.trim() || !password) {
      setErrorMessage('Please enter both your username and password.');
      return;
    }

    if (showTotp && !totpCode.trim()) {
      setErrorMessage('Please enter your 6-digit authentication code.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(username.trim(), password, totpCode.trim());

      if (result.needsTotp) {
        setShowTotp(true);
        setIsSubmitting(false);
        return;
      }

      if (result.success) {
        navigate('/', { replace: true });
      } else {
        if (result.isLockout) {
          setIsLockout(true);
          setErrorMessage(
            'Too many failed attempts. For your security, access is temporarily paused for 15 minutes. Please try again later.'
          );
        } else {
          setErrorMessage(result.error || 'Invalid username or password. Please try again.');
        }
      }
    } catch (err) {
      setErrorMessage('An unexpected connection error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-grid-bg">
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '420px',
          margin: '20px',
          padding: '32px 24px',
          zIndex: 1,
          backgroundColor: 'var(--color-surface)',
          borderRadius: '20px',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '4px' }} role="img" aria-label="Water droplet">
            💧
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--color-text)',
              letterSpacing: '-0.5px',
              margin: '0 0 6px 0',
            }}
          >
            WellSense
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Continuous Well Water Early-Warning Monitor
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              backgroundColor: isLockout ? 'var(--color-amber-bg)' : 'var(--color-red-bg)',
              color: isLockout ? 'var(--color-amber-text)' : 'var(--color-red-text)',
              fontSize: '0.875rem',
              lineHeight: 1.4,
              border: `1px solid ${isLockout ? '#fde68a' : '#fecaca'}`,
            }}
          >
            {isLockout ? '⏳ ' : '⚠️ '}
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor="username"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: '6px',
              }}
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              disabled={isSubmitting}
            />
          </div>

          <div style={{ marginBottom: showTotp ? '18px' : '24px' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={isSubmitting}
            />
          </div>

          {showTotp && (
            <div
              style={{
                marginBottom: '24px',
                animation: 'popNumber 0.25s ease-out',
              }}
            >
              <label
                htmlFor="totpCode"
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: '6px',
                }}
              >
                Two-Factor Security Code
              </label>
              <input
                id="totpCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                disabled={isSubmitting}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginTop: '4px' }}>
                Enter the code from your authenticator app
              </span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-shimmer"
            disabled={isSubmitting}
            style={{
              width: '100%',
              fontSize: '1.05rem',
              fontWeight: 700,
              padding: '14px',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {isSubmitting ? 'Signing In...' : showTotp ? 'Verify Code & Enter' : 'Sign In'}
          </button>
        </form>

        <div className="disclaimer-box" style={{ marginTop: '24px' }}>
          <span style={{ fontSize: '1.1rem' }} aria-hidden="true">
            ℹ️
          </span>
          <div>
            <strong>Important Safety Notice:</strong>
            <br />
            WellSense is an early-warning tool. It does not certify water as safe to drink.
          </div>
        </div>
      </div>
    </main>
  );
}

export default LoginPage;
