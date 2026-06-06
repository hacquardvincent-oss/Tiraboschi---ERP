import { describe, it, expect } from 'vitest';
import {
  assembleSku,
  deriveYearId,
  deriveSeasonId,
  deriveMaterialPrefix,
  nextSequentialId,
  nextColorId,
} from './sku';

describe('moteur SKU (CDC)', () => {
  it('assemble l’exemple du CDC : Victoire 2026 Été Barenia option1 bleu', () => {
    expect(
      assembleSku({
        modelId: 'AA002',
        yearId: '26',
        seasonId: 'E',
        materialId: 'CU002',
        optionId: '01',
        colorId: '001',
      }),
    ).toBe('AA00226E-CU00201-001');
  });

  it('formate option (2 chiffres) et met en majuscules', () => {
    expect(
      assembleSku({ modelId: 'ol25', yearId: '25', seasonId: 'h', materialId: 'cu001', optionId: '2', colorId: '017' }),
    ).toBe('OL2525H-CU00102-017');
  });

  it('année = 2 derniers chiffres', () => {
    expect(deriveYearId('2026')).toBe('26');
    expect(deriveYearId(2025)).toBe('25');
  });

  it('saison H/E selon le mot', () => {
    expect(deriveSeasonId('Hiver')).toBe('H');
    expect(deriveSeasonId('Automne')).toBe('H');
    expect(deriveSeasonId('Été')).toBe('E');
    expect(deriveSeasonId('Printemps')).toBe('E');
  });

  it('matière CE si exceptionnel/exotique, sinon CU', () => {
    expect(deriveMaterialPrefix('Cuir Exotique')).toBe('CE');
    expect(deriveMaterialPrefix('Cuir Exceptionnel Alligator')).toBe('CE');
    expect(deriveMaterialPrefix('Cuir Barenia')).toBe('CU');
  });

  it('incrément séquentiel modèle/matière', () => {
    expect(nextSequentialId(['AA007', 'AA003'], 'AA')).toBe('AA008');
    expect(nextSequentialId([], 'CU')).toBe('CU001');
    expect(nextSequentialId(['CE001'], 'CE')).toBe('CE002');
  });

  it('couleur incrémentée en ignorant 999 (Noir)', () => {
    expect(nextColorId(['001', '002', '999'])).toBe('003');
    expect(nextColorId(['999'])).toBe('001');
    expect(nextColorId([])).toBe('001');
  });
});
