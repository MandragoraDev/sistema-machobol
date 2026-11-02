import AppLayout from './layouts/AppLayout.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';

// Sprint 2 reemplaza esto por el enrutador con login y rutas protegidas por rol.
export default function App() {
  return (
    <AppLayout>
      <DashboardPage />
    </AppLayout>
  );
}
