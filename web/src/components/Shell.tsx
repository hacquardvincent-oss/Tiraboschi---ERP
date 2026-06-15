import { useState } from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { NavContext, type PosCustomer } from '../nav';
import { Inventaire } from '../pages/Inventaire';
import { Collection } from '../pages/Collection';
import { Admin } from '../pages/Admin';
import { Pos } from '../pages/Pos';
import { Crm } from '../pages/Crm';
import { Sales } from '../pages/Sales';
import { Dashboard } from '../pages/Dashboard';
import type { Section } from '../sections';

function Page({ section }: { section: Section }) {
  switch (section) {
    case 'inventory':
      return <Inventaire />;
    case 'collection':
      return <Collection />;
    case 'admin':
      return <Admin />;
    case 'pos':
      return <Pos />;
    case 'crm':
      return <Crm />;
    case 'dashboard':
      return <Dashboard />;
    case 'sales':
      return <Sales />;
  }
}

export function Shell() {
  const [section, setSection] = useState<Section>('dashboard');
  const [posCustomer, setPosCustomer] = useState<PosCustomer | null>(null);
  return (
    <NavContext.Provider value={{ goTo: setSection, posCustomer, setPosCustomer }}>
      <div className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1 p-4 pb-24 max-w-3xl w-full mx-auto">
          <Page section={section} />
        </main>
        <BottomNav active={section} onSelect={setSection} />
      </div>
    </NavContext.Provider>
  );
}
