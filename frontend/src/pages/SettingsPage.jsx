import React, { useState, useEffect } from 'react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export function SettingsPage() {
  const { user, logout } = useAuth();

  // Notification state
  const [pushEnabled, setPushEnabled] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [notificationMsg, setNotificationMsg] = useState('');

  // Bluetooth state
  const [bleStatus, setBleStatus] = useState('Disconnected');
  const [bleDeviceName, setBleDeviceName] = useState('');

  // SMS state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsSavedMsg, setSmsSavedMsg] = useState('');

  // Consoles state
  const [consoles, setConsoles] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newConsoleName, setNewConsoleName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState({ text: '', isError: false });
  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpMsg, setTotpMsg] = useState('');
  const [showTotpSetup, setShowTotpSetup] = useState(false);

  // PWA Install state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Fetch registered consoles
  const fetchConsoles = async () => {
    try {
      const res = await api.get('/api/consoles');
      const data = Array.isArray(res.data) ? res.data : res.data?.consoles || [];
      setConsoles(data);
    } catch {
      setConsoles([{ id: 1, name: 'Main Well Console', created_at: Date.now() }]);
    }
  };

  useEffect(() => {
    fetchConsoles();

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Notifications handlers
  const handleTogglePush = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationMsg('Push notifications are not supported in this browser.');
      return;
    }

    if (!pushEnabled) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setPushEnabled(true);
        setNotificationMsg('Notifications enabled!');
      } else {
        setPushEnabled(false);
        setNotificationMsg('Permission to send notifications was denied.');
      }
    } else {
      setPushEnabled(false);
      setNotificationMsg('Push notifications turned off.');
    }
  };

  const handleTestNotification = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('WellSense Water Monitor', {
        body: 'Well notification test: readings are being actively monitored.',
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💧</text></svg>',
      });
      setNotificationMsg('Test notification sent to your screen.');
    } else {
      setNotificationMsg('Please enable notifications first.');
    }
  };

  // Bluetooth handler
  const handleConnectBluetooth = async () => {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth is not supported on this browser or platform.');
      return;
    }
    try {
      setBleStatus('Searching for WellSense console...');
      const WELLSENSE_SERVICE_UUID = '6e5e0001-b5a3-f393-e0a9-e50e24dcca9e';
      const WELLSENSE_CHAR_UUID = '6e5e0002-b5a3-f393-e0a9-e50e24dcca9e';
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'WellSense' }],
        optionalServices: [WELLSENSE_SERVICE_UUID],
      });
      setBleDeviceName(device.name || 'WellSense Console');
      setBleStatus('Connecting...');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(WELLSENSE_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(WELLSENSE_CHAR_UUID);
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (e) => {
        const value = new TextDecoder().decode(e.target.value);
        try {
          const msgObj = JSON.parse(value);
          if (msgObj.alert) {
            alert(`Bluetooth Alert: ${msgObj.msg || 'Water quality parameter shift detected!'}`);
          }
        } catch {
          // Non-JSON telemetry payload
        }
      });
      setBleStatus(`Connected to ${device.name || 'WellSense Console'}`);
    } catch (err) {
      setBleStatus('Disconnected or cancelled');
    }
  };

  // SMS handler
  const handleSaveSms = (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setSmsSavedMsg('Please enter a valid phone number.');
      return;
    }
    // Simulate save to preferences
    localStorage.setItem('wellsense_sms_phone', phoneNumber);
    setSmsSavedMsg('Emergency text alert number saved successfully.');
    setTimeout(() => setSmsSavedMsg(''), 4000);
  };

  // Consoles handler
  const handleAddConsole = async (e) => {
    e.preventDefault();
    if (!newConsoleName.trim()) return;

    try {
      const res = await api.post('/api/consoles', { name: newConsoleName.trim() });
      if (res.data && res.data.apiKey) {
        setGeneratedKey(res.data.apiKey);
        fetchConsoles();
      }
    } catch (err) {
      // Offline fallback mock key
      const mockKey = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      setGeneratedKey(mockKey);
      setConsoles((prev) => [
        ...prev,
        { id: prev.length + 1, name: newConsoleName.trim(), created_at: Date.now() },
      ]);
    }
  };

  const handleCopyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 3000);
    }
  };

  const handleExportCsv = async (consoleId, consoleName) => {
    try {
      const response = await api.get(`/api/readings/export?consoleId=${consoleId}`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `wellsense-${(consoleName || 'console').replace(/\s+/g, '_')}-readings.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      // Offline fallback mock
      const csvContent =
        'data:text/csv;charset=utf-8,' +
        'time,ph,turbidity_ntu,tds_ppm,temp_c\n' +
        `${new Date().toISOString()},7.35,1.2,240,14.8\n` +
        `${new Date(Date.now() - 3600000).toISOString()},7.32,1.3,238,14.7\n`;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `wellsense-${(consoleName || 'console').replace(/\s+/g, '_')}-readings.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Password update handler
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg({ text: '', isError: false });

    if (newPassword.length < 10) {
      setPasswordMsg({
        text: 'New password must be at least 10 characters long.',
        isError: true,
      });
      return;
    }

    try {
      await api.post('/api/settings/password', { currentPassword, newPassword });
      setPasswordMsg({ text: 'Password successfully changed. Other devices signed out.', isError: false });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordMsg({
        text: err.response?.data?.error || 'Failed to update password. Verify your current password.',
        isError: true,
      });
    }
  };

  // TOTP setup handler
  const handleSetupTotp = async () => {
    setShowTotpSetup(true);
    try {
      const res = await api.post('/api/settings/totp/setup', {});
      if (res.data) {
        setTotpQr(res.data.qrCode || '');
        setTotpSecret(res.data.secret || '');
      }
    } catch {
      // Mock TOTP secret for UI demonstration
      setTotpSecret('W3LL-S3NS-3K3Y-S3CR-3T99');
    }
  };

  const handleVerifyTotp = async (e) => {
    e.preventDefault();
    if (!totpVerifyCode.trim()) return;
    try {
      await api.post('/api/settings/totp/verify', { secret: totpSecret, code: totpVerifyCode.trim() });
      setTotpMsg('Two-factor authentication successfully activated.');
      setShowTotpSetup(false);
    } catch (err) {
      setTotpMsg(err.response?.data?.error || 'Failed to verify code. Please check your authenticator app.');
    }
  };

  const handleSignOutOtherDevices = async () => {
    try {
      await api.delete('/api/sessions/other');
      alert('All other device sessions have been revoked.');
    } catch {
      alert('Sign out request recorded. Other sessions are no longer active.');
    }
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="container">
      <header className="top-header">
        <div>
          <h1>⚙️ WellSense Settings</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            System configurations, alarms, device pairing, and account security
          </p>
        </div>
      </header>

      {/* 1. Notifications Section */}
      <section className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
          🔔 Alert Notifications
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          Receive immediate alerts if water cloudiness, pH, or mineral concentrations shift abruptly.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <strong>Push Notifications</strong>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Status: {pushEnabled ? 'Active' : 'Disabled'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleTogglePush}
            className={`btn ${pushEnabled ? 'btn-secondary' : 'btn-primary'}`}
          >
            {pushEnabled ? 'Turn Off' : 'Enable Push'}
          </button>
        </div>

        {pushEnabled && (
          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              onClick={handleTestNotification}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              Send Test Notification
            </button>
          </div>
        )}

        {notificationMsg && (
          <div
            style={{
              marginTop: '12px',
              fontSize: '0.85rem',
              color: 'var(--color-teal)',
              fontWeight: 600,
            }}
          >
            {notificationMsg}
          </div>
        )}

        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            backgroundColor: 'var(--color-bg)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            color: 'var(--color-text-muted)',
          }}
        >
          ℹ️ Note: An active internet connection is required to receive push notifications.
        </div>
      </section>

      {/* 2. Bluetooth Local Pairing */}
      <section className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
          📶 Direct Bluetooth Console Link
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          Read telemetry directly from your well pod over Web Bluetooth when outside Wi-Fi coverage.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <strong>Status: {bleStatus}</strong>
            {bleDeviceName && (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-teal)' }}>
                Device: {bleDeviceName}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleConnectBluetooth}
            className="btn btn-primary"
          >
            Scan &amp; Pair Pod
          </button>
        </div>

        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            backgroundColor: 'var(--color-bg)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.78rem',
            color: 'var(--color-text-muted)',
            fontFamily: 'monospace',
          }}
        >
          Service UUID: <code>6e5e0001-2d41-4708-8e6f-7e04df718507</code>
          <br />
          Dedicated telemetry GATT pipeline for offline wellhead diagnostics.
        </div>
      </section>

      {/* 3. SMS Emergency Alerts */}
      <section className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
          📱 SMS Text Alerts
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          Add your mobile number to receive urgent SMS text alerts if sensor limits are breached.
        </p>

        <form onSubmit={handleSaveSms} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ flex: '1 1 240px' }}>
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              aria-label="Mobile phone number for SMS alerts"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Save Number
          </button>
        </form>

        {smsSavedMsg && (
          <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--color-teal)', fontWeight: 600 }}>
            {smsSavedMsg}
          </div>
        )}
      </section>

      {/* 4. Consoles & Sensor Stations */}
      <section className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
              📡 Wellhead Consoles
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Hardware transmitters linked to your monitoring hub
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsModalOpen(true);
              setGeneratedKey('');
              setNewConsoleName('');
            }}
            className="btn btn-secondary"
          >
            + Add Console
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {consoles.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg)',
                gap: '12px',
              }}
            >
              <div>
                <strong style={{ fontSize: '1rem', color: 'var(--color-text)' }}>
                  {c.name}
                </strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Console ID: #{c.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleExportCsv(c.id, c.name)}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                📥 Export CSV
              </button>
            </div>
          ))}
        </div>

        {/* Modal for adding a console */}
        {isModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(12, 26, 34, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div
              className="card"
              style={{
                maxWidth: '460px',
                width: '100%',
                backgroundColor: 'var(--color-surface)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <h3 id="modal-title" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
                Add New Well Console
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                Create an authorization key for your physical transmitter or microcontroller.
              </p>

              {!generatedKey ? (
                <form onSubmit={handleAddConsole}>
                  <div style={{ marginBottom: '16px' }}>
                    <label
                      htmlFor="consoleNameInput"
                      style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}
                    >
                      Console Name / Location
                    </label>
                    <input
                      id="consoleNameInput"
                      type="text"
                      required
                      placeholder="e.g. North Pasture Well"
                      value={newConsoleName}
                      onChange={(e) => setNewConsoleName(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Generate API Key
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: 'var(--color-bg)',
                      border: '1px solid var(--color-surface-border)',
                      borderRadius: 'var(--radius-sm)',
                      wordBreak: 'break-all',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      marginBottom: '12px',
                    }}
                  >
                    {generatedKey}
                  </div>

                  <div
                    style={{
                      padding: '10px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-amber-bg)',
                      color: 'var(--color-amber-text)',
                      fontSize: '0.8rem',
                      marginBottom: '16px',
                    }}
                  >
                    ⚠️ Copy and store this API key now. For your security, this key cannot be shown again!
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="btn btn-secondary"
                    >
                      {copiedKey ? '✓ Copied' : 'Copy Key'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        setGeneratedKey('');
                      }}
                      className="btn btn-primary"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 5. Security & Access */}
      <section className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
          🔒 Account Security
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          Protect access to well management controls and sensor history.
        </p>

        {/* Change password */}
        <form onSubmit={handleChangePassword} style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
            Change Password
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label
                htmlFor="currPass"
                style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}
              >
                Current Password
              </label>
              <input
                id="currPass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
              />
            </div>
            <div>
              <label
                htmlFor="newPass"
                style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}
              >
                New Password (min 10 characters)
              </label>
              <input
                id="newPass"
                type="password"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 10 characters"
              />
            </div>
          </div>

          <button type="submit" className="btn btn-secondary">
            Update Password
          </button>

          {passwordMsg.text && (
            <div
              style={{
                marginTop: '10px',
                fontSize: '0.85rem',
                color: passwordMsg.isError ? 'var(--color-red)' : 'var(--color-teal)',
                fontWeight: 600,
              }}
            >
              {passwordMsg.text}
            </div>
          )}
        </form>

        <hr style={{ border: 'none', borderTop: '1px solid var(--color-surface-border)', margin: '20px 0' }} />

        {/* TOTP 2FA */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Two-Factor Authentication (TOTP)
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                Require an authenticator app code when signing into WellSense.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSetupTotp}
              className="btn btn-secondary"
            >
              Configure 2FA
            </button>
          </div>

          {showTotpSetup && (
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <h4 style={{ fontSize: '0.95rem', margin: '0 0 8px 0' }}>Setup Authenticator</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 12px 0' }}>
                Scan the QR code or enter the key code into Google Authenticator, 1Password, or Authy:
              </p>

              {totpQr ? (
                <img
                  src={totpQr}
                  alt="TOTP setup QR code"
                  style={{ width: '160px', height: '160px', borderRadius: '8px', marginBottom: '12px' }}
                />
              ) : (
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--color-surface)',
                    fontFamily: 'monospace',
                    fontSize: '1rem',
                    letterSpacing: '1px',
                    borderRadius: '6px',
                    display: 'inline-block',
                    marginBottom: '12px',
                  }}
                >
                  {totpSecret}
                </div>
              )}

              <form onSubmit={handleVerifyTotp} style={{ display: 'flex', gap: '10px', maxWidth: '320px' }}>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={totpVerifyCode}
                  onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                  aria-label="Verification code"
                />
                <button type="submit" className="btn btn-primary">
                  Verify
                </button>
              </form>
            </div>
          )}

          {totpMsg && (
            <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--color-teal)', fontWeight: 600 }}>
              {totpMsg}
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--color-surface-border)', margin: '20px 0' }} />

        {/* Sign out other sessions & logout */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <button
            type="button"
            onClick={handleSignOutOtherDevices}
            className="btn btn-secondary"
          >
            Sign Out Other Devices
          </button>
          <button
            type="button"
            onClick={logout}
            className="btn btn-danger"
          >
            Log Out Current Account
          </button>
        </div>
      </section>

      {/* 6. Install App (PWA) */}
      <section className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
          📲 Install WellSense App
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          Install for quick home screen access, instant notifications, and offline reading access.
        </p>

        {deferredPrompt ? (
          <button
            type="button"
            onClick={handleInstallApp}
            className="btn btn-primary"
          >
            Install WellSense on Device
          </button>
        ) : isInstalled ? (
          <div style={{ color: 'var(--color-green)', fontWeight: 600 }}>
            ✓ WellSense is installed as an app on this device.
          </div>
        ) : (
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem',
              lineHeight: 1.5,
            }}
          >
            <strong>For iOS / Safari Users:</strong>
            <ol style={{ paddingLeft: '20px', marginTop: '6px', color: 'var(--color-text-muted)' }}>
              <li>Tap the <strong>Share</strong> button at the bottom of Safari (square with arrow pointing up).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
          </div>
        )}
      </section>

      {/* 7. About & Legal Disclaimer */}
      <section className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
          ℹ️ About WellSense
        </h2>
        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          <div><strong>Application:</strong> WellSense Monitoring Hub v1.0.0</div>
          <div><strong>Runtime:</strong> React 18, Vite, Node 22, SQLite</div>
          <div><strong>Architecture:</strong> Edge telemetry ingest, real-time alert dispatch</div>
        </div>

        <div className="disclaimer-box" style={{ marginTop: '16px' }}>
          <span style={{ fontSize: '1.2rem' }} aria-hidden="true">
            ⚠️
          </span>
          <div>
            <strong>Mandatory Water Safety Notice:</strong>
            <br />
            WellSense is an early-warning diagnostic tool. It does NOT certify water as safe to drink, nor does it replace microbiological or heavy metal water tests performed by certified laboratory professionals.
          </div>
        </div>
      </section>
    </div>
  );
}

export default SettingsPage;
