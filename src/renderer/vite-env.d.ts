/// <reference types="vite/client" />

import type { AppApi } from '../preload/api';

declare global {
  interface Window {
    api: AppApi;
  }
}
