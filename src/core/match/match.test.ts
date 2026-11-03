import { describe, expect, it } from 'vitest';
import type { Candidate, WorkQuery } from '../adapter';
import type { PivotWork } from '../pivot';
import { normalizeTitle, titleSimilarity } from './normalize';
import { decideMatch, scoreCandidate } from './score';

function cand(id: string, w: Partial<PivotWork> & { title: string }): Candidate {
  return {
    ref: { platform: 'senscritique', id },
    work: { kind: 'movie', externalIds: {}, refs: [{ platform: 'senscritique', id }], ...w },
  };
}

const q = (w: Partial<WorkQuery> & { title: string }): WorkQuery => ({ externalIds: {}, ...w });

describe('normalizeTitle', () => {
  it('ignore accents, casse, ponctuation et article initial', () => {
    expect(normalizeTitle("L'Étrange Noël de Monsieur Jack")).toBe('etrange noel de monsieur jack');
    expect(normalizeTitle('Les Misérables')).toBe('miserables');
    expect(normalizeTitle('The Hate U Give – La Haine qu’on donne')).toBe('hate u give la haine qu on donne');
    expect(normalizeTitle('Fast & Furious')).toBe(normalizeTitle('Fast and Furious'));
    expect(normalizeTitle('Œdipe roi')).toBe('oedipe roi');
  });
});

describe('titleSimilarity', () => {
  it('vaut 1 pour deux formes équivalentes et décroît avec les différences', () => {
    expect(titleSimilarity('La Haine', 'la haine')).toBe(1);
    expect(titleSimilarity('Le Fabuleux Destin d’Amélie Poulain', 'Le fabuleux destin d’Amelie Poulain')).toBe(1);
    expect(titleSimilarity('La Haine', 'Marqué par la haine')).toBeLessThan(0.8);
    expect(titleSimilarity('La Haine', 'Matrix')).toBeLessThan(0.2);
  });
});

describe('decideMatch', () => {
  // Données vues le 2026-11-03 sur AlloCiné (source) et SensCritique (candidats).
  const laHaine = q({ title: 'La Haine', year: 1995, directors: ['Mathieu Kassovitz'], runtimeMinutes: 95 });
  const scCandidates = [
    cand('472094', { title: 'La Haine', year: 1995, directors: ['Mathieu Kassovitz'], runtimeMinutes: 98 }),
    cand('27658769', { title: 'The Hate U Give – La Haine qu’on donne', originalTitle: 'The Hate U Give', year: 2018 }),
    cand('462757', { title: 'Marqué par la haine', originalTitle: 'Somebody Up There Likes Me', year: 1956 }),
  ];

  it('classe « sûr » un film identique malgré 3 min d’écart de durée', () => {
    const d = decideMatch(laHaine, scCandidates);
    expect(d.confidence).toBe('sure');
    expect(d.best?.candidate.ref.id).toBe('472094');
    expect(d.ranked).toHaveLength(1); // les deux autres sont éliminés par l'année
  });

  it('retrouve un film par son titre original', () => {
    const d = decideMatch(q({ title: 'À l’ombre de la haine', originalTitle: "Monster's Ball", year: 2002 }), [
      cand('374841', { title: "À l'ombre de la haine", originalTitle: "Monster's Ball", year: 2001 }),
    ]);
    expect(d.best?.candidate.ref.id).toBe('374841');
    expect(d.confidence).toBe('review'); // année à ±1 et aucun autre indice
  });

  it('classe « sûr » à ±1 an quand le réalisateur confirme', () => {
    const d = decideMatch(
      q({ title: 'À l’ombre de la haine', originalTitle: "Monster's Ball", year: 2002, directors: ['Marc Forster'] }),
      [cand('374841', { title: "À l'ombre de la haine", year: 2001, directors: ['Marc Forster'] })],
    );
    expect(d.confidence).toBe('sure');
  });

  it('ne classe pas « sûr » un remake sorti la même année qu’un homonyme', () => {
    const d = decideMatch(q({ title: 'Suspiria', year: 2018 }), [
      cand('1', { title: 'Suspiria', year: 2018, directors: ['Luca Guadagnino'] }),
      cand('2', { title: 'Suspiria', year: 1977, directors: ['Dario Argento'] }),
    ]);
    expect(d.best?.candidate.ref.id).toBe('1');
    expect(d.ranked).toHaveLength(1);
  });

  it('demande une vérification quand deux candidats sont trop proches', () => {
    const d = decideMatch(q({ title: 'Les Misérables', year: 2019 }), [
      cand('a', { title: 'Les Misérables', year: 2019 }),
      cand('b', { title: 'Les Misérables', year: 2019 }),
    ]);
    expect(d.confidence).toBe('review');
    expect(d.reason).toBe('plusieurs candidats proches');
  });

  it('n’atteint jamais « sûr » sans année', () => {
    const d = decideMatch(q({ title: 'La Haine' }), [cand('472094', { title: 'La Haine', year: 1995 })]);
    expect(d.confidence).toBe('review');
  });

  it('pénalise un réalisateur différent', () => {
    const same = scoreCandidate(laHaine, cand('x', { title: 'La Haine', year: 1995, directors: ['Mathieu Kassovitz'] }))!;
    const other = scoreCandidate(laHaine, cand('y', { title: 'La Haine', year: 1995, directors: ['Quelqu’un d’autre'] }))!;
    expect(other.score).toBeLessThan(0.85);
    expect(same.score).toBeGreaterThan(other.score);
  });

  it('ne laisse pas l’année compenser un titre sans rapport', () => {
    const d = decideMatch(q({ title: 'La Haine', year: 1995, runtimeMinutes: 95 }), [
      cand('z', { title: 'Toy Story', year: 1995, runtimeMinutes: 95 }),
    ]);
    expect(d.confidence).toBe('not_found');
  });

  it('se fie à un identifiant externe commun, et écarte un identifiant contradictoire', () => {
    const query = q({ title: 'Hate', externalIds: { imdb: 'tt0113247' } });
    const d = decideMatch(query, [
      cand('ok', { title: 'La Haine', externalIds: { imdb: 'tt0113247' } }),
      cand('ko', { title: 'Hate', year: 1995, externalIds: { imdb: 'tt9999999' } }),
    ]);
    expect(d).toMatchObject({ confidence: 'sure', reason: 'identifiant externe identique' });
    expect(d.ranked.map((r) => r.candidate.ref.id)).toEqual(['ok']);
  });

  it('renvoie « introuvable » sans candidat', () => {
    expect(decideMatch(laHaine, [])).toMatchObject({ confidence: 'not_found', reason: 'aucun candidat' });
  });
});
