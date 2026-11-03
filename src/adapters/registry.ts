import { canBeDestination, canBeSource, type PlatformAdapter } from '../core/adapter';
import type { PlatformId } from '../core/pivot';
import { allocine } from './allocine';
import { imdb } from './imdb';
import { letterboxd } from './letterboxd';
import { senscritique } from './senscritique';

/** Ajouter une plateforme : écrire son adaptateur, l'ajouter ici et déclarer ses origines dans core/permissions.ts. */
export const ADAPTERS: readonly PlatformAdapter[] = [allocine, senscritique, letterboxd, imdb];

export function getAdapter(id: PlatformId): PlatformAdapter {
  const a = ADAPTERS.find((x) => x.id === id);
  if (!a) throw new Error(`Plateforme inconnue : ${id}`);
  return a;
}

export const sources = () => ADAPTERS.filter(canBeSource);

/** Destinations possibles pour une source donnée (jamais la source elle-même). */
export const destinationsFor = (source: PlatformId) => ADAPTERS.filter((a) => canBeDestination(a) && a.id !== source);
