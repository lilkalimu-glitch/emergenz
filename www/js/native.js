// Verbindung zu Android über Capacitor (Statusleiste, Zurück-Taste, Vibration, Pause).
// Im Browser fehlen die Plugins, dann passiert hier einfach nichts.

const plugins = () => (typeof window !== 'undefined' && window.EPlugins) || {};

export function isNative() {
  return typeof window !== 'undefined' && !!window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
}

export async function setupBars() {
  const { StatusBar } = plugins();
  if (!StatusBar || !isNative()) return;
  try {
    await StatusBar.setStyle({ style: 'DARK' });
    await StatusBar.setBackgroundColor({ color: '#050913' });
  } catch (e) {
    console.warn('Statusleiste', e);
  }
}

export function onBack(handler) {
  const { App } = plugins();
  if (!App || !isNative()) return;
  App.addListener('backButton', () => {
    if (!handler()) App.minimizeApp().catch(() => App.exitApp());
  });
}

export function onPause(handler) {
  const { App } = plugins();
  if (App && isNative()) App.addListener('pause', handler);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handler();
  });
}

export function buzz(strength = 'MEDIUM') {
  const { Haptics } = plugins();
  if (!Haptics || !isNative()) return;
  Haptics.impact({ style: strength }).catch(() => {});
}
