// @ts-check
// Astro config for Docker/standalone deployment
// This swaps vercel() for node() standalone mode so dist/server.js works.
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    envPrefix: ['DATABASE_', 'LLM_', 'EMAIL_', 'ANTHROPIC_', 'RESEND_', 'SENDGRID_', 'MAILGUN_', 'LUCIA_', 'POUNCE_', 'APP_', 'NODE_ENV'],
    plugins: [tailwindcss()],
  },
});