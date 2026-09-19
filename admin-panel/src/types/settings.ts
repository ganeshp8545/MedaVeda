export interface AppSettings {
  appName: string;
  supportEmail: string;
  supportPhone: string;
  maintenanceMode: boolean;
  termsUrl: string;
  privacyUrl: string;
  razorpayKeyId: string;
}

export type AppSettingsInput = AppSettings;
