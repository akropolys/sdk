import { HuskelConfig } from './types';
import { HuskelAPI } from './api';

export class HuskelClient {
  readonly api: HuskelAPI;

  constructor(config: HuskelConfig) {
    this.api = new HuskelAPI(config.apiUrl, config.siteId, config.apiToken);
  }
}

let instance: HuskelClient | null = null;

export function initHuskel(config: HuskelConfig): HuskelClient {
  instance = new HuskelClient(config);
  return instance;
}

export function getHuskelClient(): HuskelClient {
  if (!instance) throw new Error('[Huskel] Call initHuskel() before using the client.');
  return instance;
}
