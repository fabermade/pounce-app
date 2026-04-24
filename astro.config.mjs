// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone', // Self-contained server for Vercel/Railway/Render
  }),
  integrations: [react()],
  vite: {
    envPrefix: ['DATABASE_', 'LLM_', 'EMAIL_', 'ANTHROPIC_', 'RESEND_', 'SENDGRID_', 'MAILGUN_', 'LUCIA_', 'POUNCE_', 'APP_', 'NODE_ENV'],
    plugins: [tailwindcss()],
  },
});