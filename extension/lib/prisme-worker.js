// Prisme : analyse d'un gros fichier hors de la page (Web Worker), pour qu'elle reste utilisable.
// Message reçu : { id, bytes, options } ; réponse : { id, res } ou { id, error }.
import { analyze } from './prisme.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, res: analyze(data.bytes, data.options) });
  } catch (e) {
    self.postMessage({ id: data.id, error: (e && e.message) || 'Analyse impossible' });
  }
};
