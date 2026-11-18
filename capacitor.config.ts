import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imc.cleanmanager',
  appName: 'IMC Clean Manager',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    // Load the published HTTPS app inside the native Android shell.
    url: 'https://imc-clean-manager-mhdt.onrender.com',
    cleartext: false,
  },
};

export default config;
