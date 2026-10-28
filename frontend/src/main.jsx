import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { AuthProvider, DataProvider, useAuth } from './context';
import { Shell, Loading, Empty } from './components';
import { AuthPage, Overview, Curriculum, ProgressPage, AccountSettings } from './pages';
import { TopicPage } from './learning-ui';
import { FacultyPage, ContentPage, AdminPage } from './staff';
import ComparePage from './compare';
import CurriculumEditor from './curriculum-editor';
import './styles.css';
const WorkspacePage = lazy(() => import('./workspace').then((m) => ({ default: m.WorkspacePage })));
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="app-fatal">
          <h1>Trace could not display this screen.</h1>
          <p>Reload the workspace to restore its last saved state.</p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload workspace
          </button>
        </div>
      );
    return this.props.children;
  }
}
function Guard({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}
function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Restoring your workspace…" />;
  if (!user) return <AuthPage />;
  return (
    <DataProvider>
      <Shell>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/curriculum" element={<Curriculum />} />
            <Route
              path="/curriculum/manage"
              element={
                <Guard roles={['FACULTY', 'ADMIN']}>
                  <CurriculumEditor />
                </Guard>
              }
            />
            <Route path="/topics/:topicId" element={<TopicPage />} />
            <Route
              path="/simulations"
              element={
                <Guard roles={['STUDENT']}>
                  <Curriculum simulationsOnly />
                </Guard>
              }
            />
            <Route
              path="/workspace"
              element={
                <Guard roles={['STUDENT']}>
                  <WorkspacePage />
                </Guard>
              }
            />
            <Route
              path="/compare"
              element={
                <Guard roles={['STUDENT']}>
                  <ComparePage />
                </Guard>
              }
            />
            <Route
              path="/progress"
              element={
                <Guard roles={['STUDENT']}>
                  <ProgressPage />
                </Guard>
              }
            />
            <Route
              path="/faculty"
              element={
                <Guard roles={['FACULTY', 'ADMIN']}>
                  <FacultyPage />
                </Guard>
              }
            />
            <Route
              path="/content"
              element={
                <Guard roles={['FACULTY', 'ADMIN']}>
                  <ContentPage />
                </Guard>
              }
            />
            <Route
              path="/admin"
              element={
                <Guard roles={['ADMIN']}>
                  <AdminPage />
                </Guard>
              }
            />
            <Route path="/settings" element={<AccountSettings />} />
            <Route
              path="*"
              element={
                <Empty>
                  This screen does not exist.<Link to="/">Return to overview</Link>
                </Empty>
              }
            />
          </Routes>
        </Suspense>
      </Shell>
    </DataProvider>
  );
}
createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
