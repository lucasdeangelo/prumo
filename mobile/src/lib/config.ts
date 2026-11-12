// Public values only. The service key and every secret stay on the web server.
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, ""),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};

export const configured = Boolean(config.apiUrl && config.supabaseUrl && config.supabaseKey);
