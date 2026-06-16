import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'fr' | 'en';

// Clés historiques (navigation, login). Conservées pour compatibilité.
const dict: Record<string, Record<Lang, string>> = {
  'app.title': { fr: 'Tiraboschi', en: 'Tiraboschi' },
  'nav.dashboard': { fr: 'Accueil', en: 'Home' },
  'nav.pos': { fr: 'Caisse', en: 'POS' },
  'nav.collection': { fr: 'Collection', en: 'Collection' },
  'nav.crm': { fr: 'Clients', en: 'Clients' },
  'nav.sales': { fr: 'Ventes', en: 'Sales' },
  'nav.inventory': { fr: 'OPS', en: 'OPS' },
  'nav.admin': { fr: 'Admin', en: 'Admin' },
  'login.title': { fr: 'Connexion', en: 'Sign in' },
  'login.email': { fr: 'Email', en: 'Email' },
  'login.password': { fr: 'Mot de passe', en: 'Password' },
  'login.submit': { fr: 'Se connecter', en: 'Sign in' },
  'common.logout': { fr: 'Déconnexion', en: 'Logout' },
  'common.loading': { fr: 'Chargement…', en: 'Loading…' },
  'common.soon': { fr: 'Bientôt disponible', en: 'Coming soon' },
};

// Table FR → EN : la chaîne FR sert de clé (`t('Texte français')`).
// Une chaîne absente reste en français (repli gracieux).
const EN: Record<string, string> = {
  // Commun
  'Rechercher…': 'Search…',
  'Annuler': 'Cancel',
  'Enregistrer': 'Save',
  'Modifier': 'Edit',
  'Supprimer': 'Delete',
  'Importer': 'Import',
  'Importer CSV': 'Import CSV',
  'Valider': 'Confirm',
  'Total': 'Total',
  'Statut': 'Status',
  'Client': 'Customer',
  'Aucune entrée.': 'No entries.',
  // Dashboard
  'Bonjour': 'Hello',
  'Activité Shopify — 31 derniers jours': 'Shopify activity — last 31 days',
  'Chargement des KPIs…': 'Loading KPIs…',
  'Client inconnu': 'Unknown customer',
  "Aujourd'hui": 'Today',
  'Cette semaine': 'This week',
  'Ce mois': 'This month',
  'Base clients': 'Customers',
  'Emails opt-in': 'Marketing opt-ins',
  'Actions rapides': 'Quick actions',
  'Nouvelle vente': 'New sale',
  'Voir le stock': 'View stock',
  'Dernières transactions': 'Recent transactions',
  'Tout voir': 'See all',
  'Aucune transaction récente.': 'No recent transactions.',
  // POS
  'Caisse (POS)': 'Checkout (POS)',
  'Marché': 'Market',
  'Produit': 'Product',
  '+ Pièce hors catalogue': '+ Off-catalog item',
  'Rechercher une référence (SKU ou nom)…': 'Search a reference (SKU or name)…',
  'Désignation (ex. Sur-mesure)': 'Description (e.g. Bespoke)',
  'Ajouter': 'Add',
  'Panier': 'Cart',
  'Panier vide.': 'Empty cart.',
  'Prénom': 'First name',
  'Nom': 'Last name',
  'Email (obligatoire pour le reçu)': 'Email (required for receipt)',
  'Téléphone': 'Phone',
  'Adresse (ligne 1)': 'Address (line 1)',
  'Appartement, suite… (optionnel)': 'Apartment, suite… (optional)',
  'Ville': 'City',
  'Code postal': 'Zip code',
  'État / Province': 'State / Province',
  'Notes sur le client (goûts…)': 'Customer notes (tastes…)',
  'Marketing email': 'Email marketing',
  'Marketing SMS': 'SMS marketing',
  'Expédié DDP': 'Shipped DDP',
  'Calculer la taxe (Shopify)': 'Calculate tax (Shopify)',
  'Sous-total HT': 'Subtotal (excl. tax)',
  'Frais de port (DDP)': 'Shipping (DDP)',
  'Livrable ~': 'Available ~',
  'Encaisser TPE': 'Charge on reader',
  'Lien': 'Link',
  'Enreg.': 'Save',
  'Lien de paiement': 'Payment link',
  'Copier': 'Copy',
  '+ Nouvelle vente': '+ New sale',
  // Ventes
  'Ventes': 'Sales',
  'Rechercher (réf, client, commande)…': 'Search (ref, customer, order)…',
  'Rembourser': 'Refund',
  'Encaisser': 'Charge',
  'Payée': 'Paid',
  'À encaisser': 'To charge',
  'Annulée': 'Cancelled',
  'Remboursée': 'Refunded',
  'Aucune vente': 'No sales',
  // CRM
  'Annuaire clients': 'Customer directory',
  '+ Nouveau client': '+ New customer',
  'Nouveau client': 'New customer',
  'Choisir': 'Select',
  'Rechercher (email ou nom)…': 'Search (email or name)…',
  'Commandes': 'Orders',
  'Total dépensé': 'Total spent',
  'Adresse': 'Address',
  // Collection
  'Collection': 'Collection',
  '+ Nouveau modèle': '+ New model',
  'Images Shopify': 'Shopify images',
  'Catalogue': 'Catalog',
  'Fiches techniques': 'Tech sheets',
  'Édition': 'Editing',
  'Catalogue & délais': 'Catalog & lead times',
  'En stock': 'In stock',
  'Sur commande': 'Made to order',
  // OPS
  'OPS — Production & stock': 'OPS — Production & stock',
  'Tableau de bord': 'Dashboard',
  'Stock matières': 'Materials stock',
  'Production': 'Production',
  'Planification': 'Planning',
  'Stock pièces': 'Finished stock',
  'Ateliers': 'Workshops',
  '+ Réception': '+ Receipt',
  'Sortie exceptionnelle': 'Exceptional out',
  // Admin
  'Base de données': 'Database',
  'Utilisateurs': 'Users',
  'Gestion des utilisateurs': 'User management',
  '+ Utilisateur': '+ User',
  'Vendeur': 'Seller',
  'Administrateur': 'Administrator',
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>((localStorage.getItem('tiraboschi_lang') as Lang) || 'fr');
  const set = (l: Lang) => {
    setLang(l);
    localStorage.setItem('tiraboschi_lang', l);
  };
  const t = (key: string): string => {
    if (dict[key]) return dict[key][lang];
    if (lang === 'en') return EN[key] ?? key;
    return key;
  };
  return <Ctx.Provider value={{ lang, setLang: set, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n hors provider');
  return ctx;
}
