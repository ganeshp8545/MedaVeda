export interface AppSettings {
  appName: string;
  supportEmail: string;
  supportPhone: string;
  maintenanceMode: boolean;
  termsUrl: string;
  privacyUrl: string;
  razorpayKeyId: string;
  // Stored in app_config (not app_settings); publicly readable by the app.
  minAppVersion: string;
  storeUrl: string;
}

export type AppSettingsInput = AppSettings;
