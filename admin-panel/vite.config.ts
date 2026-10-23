import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

export default defineConfig(({ mode }) => {
  if (mode === 'staging') {
    const env = loadEnv(mode, process.cwd(), '')
    const production = JSON.parse(readFileSync(new URL('../mobile-app/eas.json', import.meta.url), 'utf8')).build.production.env
    if (env.VITE_MEDVEDA_BUILD_TARGET !== 'staging' ||
        env.VITE_SUPABASE_URL !== 'https://nsmsqsogedzohwboripd.supabase.co' ||
        !env.VITE_SUPABASE_ANON_KEY?.startsWith('sb_publishable_') ||
        env.VITE_SUPABASE_ANON_KEY === production.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('Staging admin build requires the exact staging URL and a distinct publishable key.')
    }
  }
  return { plugins: [react(), tailwindcss()] }
})
