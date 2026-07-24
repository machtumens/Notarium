import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import { AuthProvider } from './app/AuthProvider';
import { AppRoutes } from './app/AppRoutes';

export { useAuth } from './app/AuthContext';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  );
}

export default App;
