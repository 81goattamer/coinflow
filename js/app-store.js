import { Store } from './store.js';
import { loadRepo } from './db.js';
import { detectLang } from './i18n.js';

export const store = new Store({ repo: await loadRepo(), lang: detectLang() });
