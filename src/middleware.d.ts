/// <reference path="../.astro/types.d.ts" />

declare namespace Astro {
  interface Locals {
    session?: {
      userId: string;
      email: string;
      role: 'owner' | 'admin' | 'viewer';
    };
  }
}