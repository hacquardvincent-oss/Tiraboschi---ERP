import { describe, it, expect } from 'vitest';
import {
  assembleSku,
  deriveYearId,
  deriveSeasonId,
  deriveMaterialPrefix,
  nextSequentialId,
  nextColorId,
  nextRefCode,
  generateRefId,
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

  describe('nextRefCode (générateur d’ID par catégorie)', () => {
    it('couleurs : numérique pur, ignore 999, paddé 3 chiffres', () => {
      expect(nextRefCode(['001', '002', '999'])).toBe('003');
      expect(nextRefCode([], '')).toBe('001');
    });
    it('modèles : détecte le préfixe alpha et incrémente', () => {
      expect(nextRefCode(['AA001', 'AA002'])).toBe('AA003');
      expect(nextRefCode(['AA001', 'AB001', 'AA002'])).toBe('AA003'); // préfixe le plus fréquent
    });
    it('matières : préfixe forcé (CU / CE)', () => {
      expect(nextRefCode(['CU001', 'CU007'], 'CU')).toBe('CU008');
      expect(nextRefCode([], 'CE')).toBe('CE001');
    });
    it('liste vide sans indice → 001', () => {
      expect(nextRefCode([])).toBe('001');
    });
    it('ignore les codes en texte libre (« chaine laiton ») pour ne pas casser le calcul', () => {
      expect(nextRefCode(['001', 'chaine laiton', '002'], '')).toBe('003');
    });
  });

  describe('generateRefId (règles EXACTES de la V1)', () => {
    it('modèles : préfixe fixe AA, paddé 3', () => {
      expect(generateRefId('models', 'Nouveau', ['AA008', 'AA003'])).toBe('AA009');
      expect(generateRefId('models', 'Premier', [])).toBe('AA001');
    });
    it('couleurs : séquence 3 chiffres, ignore ≥900 (Noir 999 réservé)', () => {
      expect(generateRefId('colors', 'Bordeaux', ['001', '017', '999'])).toBe('018');
      expect(generateRefId('colors', 'Premier', [])).toBe('001');
    });
    it('matières globales : CE si exceptionnel/exotique, sinon CU', () => {
      expect(generateRefId('globalMaterials', 'Cuir Box', ['CU001', 'CU002'])).toBe('CU003');
      expect(generateRefId('globalMaterials', 'Cuir Exotique Alligator', ['CE001'])).toBe('CE002');
    });
    it('options/tailles : séquence paddée 2', () => {
      expect(generateRefId('options', 'Pochon', ['01', '02'])).toBe('03');
      expect(generateRefId('sizes', 'M', [])).toBe('01');
    });
    it('années : 2 derniers chiffres du libellé', () => {
      expect(generateRefId('years', '2026', [])).toBe('26');
    });
    it('saisons : H (hiver/automne) ou E (été/printemps)', () => {
      expect(generateRefId('seasons', 'Hiver', [])).toBe('H');
      expect(generateRefId('seasons', 'Printemps', [])).toBe('E');
      expect(generateRefId('seasons', 'Été', [])).toBe('E');
    });
    it('catégories auto : PREFIX-### (fournisseurs FOU, ateliers ATE, bijouterie BIZ)', () => {
      expect(generateRefId('suppliers', 'Tannerie X', ['FOU-001', 'FOU-002'])).toBe('FOU-003');
      expect(generateRefId('ateliers', 'Atelier Paris', [])).toBe('ATE-001');
      expect(generateRefId('jewelry', 'Fermoir or', ['BIZ-001'])).toBe('BIZ-002');
      expect(generateRefId('hsCodes', '4202', [])).toBe('CHS-001');
    });
  });
});
