/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    session?: {
      userId: string;
      email: string;
      role: 'owner' | 'admin' | 'viewer';
    };
  }
}