import { createContext, useContext } from 'react';
import type { Section } from './sections';

/** Coordonnées client transmises du CRM vers le POS (« Choisir »). */
export interface PosCustomer {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  zip?: string;
  province?: string;
  country?: string;
  note?: string;
}

interface NavCtx {
  goTo: (s: Section) => void;
  posCustomer: PosCustomer | null;
  /** Pose un client à pré-remplir au POS (consommé par le POS au montage). */
  setPosCustomer: (c: PosCustomer | null) => void;
}

export const NavContext = createContext<NavCtx | null>(null);

export function useNav(): NavCtx {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav hors provider');
  return ctx;
}
