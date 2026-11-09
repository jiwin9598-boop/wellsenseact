// WellSense Service Worker Registration and PWA Utilities

let deferredPrompt = null;
let swRegistration = null;

// Convert base64 url-safe string to Uint8Array for PushManager
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 1. Listen for install prompt from browser
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Prevent the default mini-infobar or automatic prompt
    event.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = event;
    // Dispatch custom event so React UI can show an "Install App" button
    window.dispatchEvent(new CustomEvent('wellsense:installable', { detail: { installable: true } }));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('wellsense:installed'));
  });

  // Register service worker on load
  const register = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });
        swRegistration = registration;

        // Check for updates periodically
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                window.dispatchEvent(new CustomEvent('wellsense:updateavailable'));
              }
            });
          }
        });
      } catch (err) {
        console.error('Service worker registration failed:', err);
      }
    }
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register);
  }
}

/**
 * Triggers the browser install prompt if available.
 * @returns {Promise<{ outcome: string }>} 'accepted', 'dismissed', or 'unavailable'
 */
export async function installApp() {
  if (!deferredPrompt) {
    return { outcome: 'unavailable' };
  }

  // Show the prompt
  deferredPrompt.prompt();
  // Wait for the user to respond to the prompt
  const choiceResult = await deferredPrompt.userChoice;
  // Clear the deferred prompt variable since it can only be used once
  deferredPrompt = null;
  return choiceResult;
}

/**
 * Check if the app is currently installable (prompt received)
 */
export function isInstallPromptAvailable() {
  return deferredPrompt !== null;
}

/**
 * Request notification permission and subscribe to push notifications
 * @param {string} [vapidPublicKey] - Optional VAPID public key
 * @returns {Promise<{ granted: boolean, subscription: PushSubscription | null, error?: string }>}
 */
export async function requestNotificationPermission(vapidPublicKey) {
  if (!('Notification' in window)) {
    return { granted: false, subscription: null, error: 'Notifications not supported' };
  }

  if (!('serviceWorker' in navigator)) {
    return { granted: false, subscription: null, error: 'Service workers not supported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { granted: false, subscription: null, error: 'Permission denied' };
  }

  try {
    const registration = swRegistration || await navigator.serviceWorker.ready;
    if (!registration.pushManager) {
      return { granted: true, subscription: null, error: 'Push messaging not supported' };
    }

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();

    // If no existing subscription and key provided, create new subscription
    if (!subscription && vapidPublicKey) {
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    return { granted: true, subscription };
  } catch (error) {
    console.error('Failed to subscribe for push notifications:', error);
    return { granted: true, subscription: null, error: error.message };
  }
}
