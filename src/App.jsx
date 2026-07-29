import React from 'react';
import OverlayWindow from './components/OverlayWindow.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import OnboardingFlow from './components/OnboardingFlow.jsx';

function currentRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/settings')) return 'settings';
  if (hash.startsWith('/onboarding')) return 'onboarding';
  return 'overlay';
}

export default function App() {
  const route = currentRoute();

  if (route === 'settings') return <SettingsPage />;
  if (route === 'onboarding') return <OnboardingFlow />;
  return <OverlayWindow />;
}
