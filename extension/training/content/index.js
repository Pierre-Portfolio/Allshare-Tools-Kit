// Training : les trois modules, dans l'ordre d'affichage.
import rh from './rh/index.js';
import olap from './olap/index.js';
import apex from './apex/index.js';

export const MODULES = [rh, olap, apex];

export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;
