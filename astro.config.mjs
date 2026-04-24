// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  vite: {
    envPrefix: ['DATABASE_', 'LLM_', 'EMAIL_', 'ANTHROPIC_', 'RESEND_', 'SENDGRID_', 'MAILGUN_', 'LUCIA_', 'POUNCE_', 'APP_', 'NODE_ENV'],
    plugins: [tailwindcss()],
  },
});