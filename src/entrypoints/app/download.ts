/** Propose un fichier à l'utilisateur, généré localement (aucun envoi réseau). */
export function download(name: string, content: string, mimeType: string) {
  const blob = new Blob([mimeType.startsWith('text/csv') ? '﻿' + content : content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const stampForFile = (d = new Date()) => d.toISOString().slice(0, 16).replace(/[:T]/g, '-');
