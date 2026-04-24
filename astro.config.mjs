// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server', // Required for API routes
  integrations: [react()],
  vite: {
    envPrefix: ['DATABASE_', 'OPENAI_', 'ANTHROPIC_', 'RESEND_', 'SENDGRID_', 'MAILGUN_', 'LUCIA_', 'POUNCE_', 'APP_', 'NODE_ENV'],
    plugins: [tailwindcss()],
  },
});