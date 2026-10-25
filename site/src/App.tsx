import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import CommandPalette from './components/CommandPalette';
import ContextCursor from './components/ContextCursor';
import Backdrop from './components/Backdrop';
import FolioRail from './components/FolioRail';
import ErrorBoundary from './components/ErrorBoundary';
import EasterEggs from './components/EasterEggs';
import HashScroll from './components/HashScroll';
import './a11y-eggs.css';
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
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Media = lazy(() => import('./pages/Media'));
const Projects = lazy(() => import('./pages/Projects'));
const Recruit = lazy(() => import('./pages/Recruit'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <a href="#main" className="nsdc-skip-link">
          Skip to content
        </a>
        <Backdrop />
        <HashScroll />
        <div className="relative z-10 flex min-h-screen flex-col">
          <SiteHeader />
          <AnnouncementBanner />
          <main id="main" tabIndex={-1} className="flex-1">
            <ErrorBoundary>
            {/* Reserve a viewport of height while a lazy route loads. A
                one-line fallback puts the footer at the viewport bottom, and
                the route then pushes it down — measured as CLS 0.36 on
                desktop /recruit. Same box as the page shells (py-12). */}
            <Suspense fallback={<div className="shell min-h-[100svh] py-12 font-mono text-xs uppercase tracking-wide text-muted">Loading…</div>}>
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
              <Route path="/archive" element={<Media archive />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/recruit" element={<Recruit />} />
              <Route path="/admin" element={<AdminDoor />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </main>
          <SiteFooter />
        </div>
        <FolioRail />
        <CommandPalette />
        <EasterEggs />
        <ContextCursor />
      </AuthProvider>
    </BrowserRouter>
  );
}