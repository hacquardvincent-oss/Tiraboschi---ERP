import { useState } from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Placeholder } from '../pages/Placeholder';
import { Inventaire } from '../pages/Inventaire';
import type { Section } from '../sections';

function Page({ section }: { section: Section }) {
  switch (section) {
    case 'inventory':
      return <Inventaire />;
    case 'dashboard':
      return <Placeholder titleKey="nav.dashboard" />;
    case 'pos':
      return <Placeholder titleKey="nav.pos" />;
    case 'collection':
      return <Placeholder titleKey="nav.collection" />;
    case 'crm':
      return <Placeholder titleKey="nav.crm" />;
    case 'sales':
      return <Placeholder titleKey="nav.sales" />;
    case 'admin':
      return <Placeholder titleKey="nav.admin" />;
  }
}

export function Shell() {
  const [section, setSection] = useState<Section>('dashboard');
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1 p-4 pb-24 max-w-3xl w-full mx-auto">
        <Page section={section} />
      </main>
      <BottomNav active={section} onSelect={setSection} />
    </div>
  );
}
