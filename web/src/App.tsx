import { I18nProvider } from './i18n';
import { AuthProvider, CurrencyProvider, useAuth } from './store';
import { Login } from './components/Login';
import { Shell } from './components/Shell';

function Gate() {
  const { user } = useAuth();
  return user ? <Shell /> : <Login />;
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <CurrencyProvider>
          <Gate />
        </CurrencyProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
