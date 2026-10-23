import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import CommandPalette from './components/CommandPalette';
import ContextCursor from './components/ContextCursor';
import Backdrop from './components/Backdrop';
import FolioRail from './components/FolioRail';
import { AuthProvider } from './lib/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AdminDoor from './pages/AdminDoor';
import NotFound from './pages/NotFound';
import Register from './pages/Register';
import VerifyPending from './pages/VerifyPending';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
import Registrations from './pages/Registrations';
import AnnouncementBanner from './components/AnnouncementBanner';
const EventDetail = lazy(() => import('./pages/EventDetail'));
const Media = lazy(() => import('./pages/Media'));
const Projects = lazy(() => import('./pages/Projects'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Backdrop />
        <div className="relative z-10 flex min-h-screen flex-col">
          <SiteHeader />
          <AnnouncementBanner />
          <main className="flex-1">
            <Suspense fallback={<p className="shell py-12 font-mono text-xs uppercase tracking-wide text-muted">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-pending" element={<VerifyPending />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/registrations" element={<Registrations />} />
              <Route path="/registrations/:id" element={<EventDetail />} />
              <Route path="/media" element={<Media />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/admin" element={<AdminDoor />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </main>
          <SiteFooter />
        </div>
        <FolioRail />
        <CommandPalette />
        <ContextCursor />
      </AuthProvider>
    </BrowserRouter>
  );
}
