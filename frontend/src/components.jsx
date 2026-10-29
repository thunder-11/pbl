import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Workflow,
  Code2,
  ChartNoAxesCombined,
  SlidersHorizontal,
  GraduationCap,
  UsersRound,
  LogOut,
  Menu,
  X,
  Search,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Check,
} from 'lucide-react';
import { useAuth, useData } from './context';
import { message } from './api';
export function Mark() {
  return (
    <svg
      className="brand-mark"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7h8m4 0h8M4 21h8m4 0h8M8 7l12 14M20 7L8 21"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="8" cy="7" r="3" fill="var(--ground)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="20" cy="21" r="3" fill="var(--ground)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
export function Loading({ label = 'Loading learning data…' }) {
  return (
    <div className="loading-state" role="status">
      <div className="skeleton" />
      <span>{label}</span>
    </div>
  );
}
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-box" role="alert">
      <p>{typeof error === 'string' ? error : message(error)}</p>
      {onRetry && (
        <button className="text-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
export function Empty({ children, action }) {
  return (
    <div className="empty-state">
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function PageHeading({ title, description, action }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Panel({ title, description, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export const formatPercent = (n) =>
  n === null || n === undefined ? '—' : `${Number(n).toFixed(2)}%`;
export function ProgressBar({ value, label }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
export function TopicLink({ topic, children, activity }) {
  return (
    <Link
      className="topic-link"
      to={`/topics/${topic.id || topic.topicId}${activity ? `?activity=${activity}` : ''}`}
    >
      {children || topic.title}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function WorkflowStrip({ progress, availability }) {
  const entries = [
    ['UNDERSTAND', 'Understand', 'Read the concept'],
    ['SIMULATE', 'Predict', 'Explore each state'],
    ['ASSESS', 'Practise', 'Check your understanding'],
    ['CODE', 'Implement', 'Test your solution'],
  ];
  return (
    <div className="workflow-strip">
      {entries
        .filter(([key]) =>
          availability
            ? availability[
                { UNDERSTAND: 'understand', SIMULATE: 'simulate', ASSESS: 'assess', CODE: 'code' }[
                  key
                ]
              ]
            : progress?.availableCategories?.includes(key),
        )
        .map(([key, title, description]) => {
          const available = progress?.availableCategories?.includes(key),
            done = progress?.completedCategories?.includes(key);
          return (
            <div
              key={key}
              className={`workflow-step ${key.toLowerCase()} ${done ? 'complete' : ''}`}
            >
              <span className="step-marker">
                {done ? <Check size={13} aria-hidden="true" /> : '•'}
              </span>
              <div>
                <strong>{title}</strong>
                <span>{available ? description : 'Not available for this topic'}</span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
export function Shell({ children }) {
  const { user, logout } = useAuth(),
    { loading, error, refresh } = useData(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    location = useLocation(),
    navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector('#workspace-search')?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const nav =
    user.role === 'STUDENT'
      ? [
          ['/', 'Overview', LayoutDashboard],
          ['/curriculum', 'Curriculum', BookOpen],
          ['/simulations', 'Simulation lab', Workflow],
          ['/workspace', 'Coding workspace', Code2],
          ['/compare', 'Compare algorithms', ChartNoAxesCombined],
          ['/progress', 'My progress', GraduationCap],
        ]
      : [
          ['/', 'Overview', LayoutDashboard],
          ['/curriculum', 'Curriculum', BookOpen],
          ['/faculty', 'Student progress', GraduationCap],
          ['/content', 'Content studio', BookOpen],
          ...(user.role === 'ADMIN' ? [['/admin', 'Accounts & rules', UsersRound]] : []),
        ];
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <Link to="/" className="brand">
          <Mark />
          <span>
            Cerebro<span className="brand-subline">Learning workbench</span>
          </span>
        </Link>
        <div className="workspace-label">
          Computer Engineering<span>K. K. Wagh · 2023 pattern</span>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([url, label, Icon]) => (
            <NavLink key={url} to={url} end={url === '/'}>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <div className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/curriculum?q=${encodeURIComponent(query)}`);
            }}
          >
            <Search size={16} />
            <input
              id="workspace-search"
              aria-label="Search curriculum"
              placeholder="Find a topic in your syllabus"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>Ctrl K</kbd>
          </form>
          <AccountMenu />
        </div>
        <main id="main" className="sheet" key={location.pathname}>
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorBox error={error} onRetry={() => refresh().catch(() => {})} />
          ) : (
            children
          )}
        </main>
      </div>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const container = useRef(null),
    trigger = useRef(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e) => {
      if (!container.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const initials = user.displayName
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="account-menu"
      ref={container}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="account-trigger"
        aria-label="Open account menu"
        aria-expanded={open}
        aria-controls="account-dropdown"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="account-trigger-name">{user.displayName}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-dropdown" id="account-dropdown">
          <div className="account-summary">
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </div>
          <nav aria-label="Your account">
            {user.role === 'STUDENT' && (
              <Link to="/profile" onClick={() => setOpen(false)}>
                <UsersRound size={16} />
                Student profile
              </Link>
            )}
            <Link to="/settings" onClick={() => setOpen(false)}>
              <SlidersHorizontal size={16} />
              Account settings
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout().catch(() => {});
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

export function Breadcrumbs({ topic }) {
  const { ancestry } = useData();
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {ancestry(topic).map((n, i) => (
        <React.Fragment key={n.id}>
          {i > 0 && <ChevronRight size={12} />}
          <span>{n.title}</span>
        </React.Fragment>
      ))}
    </nav>
  );
}
export function RetryButton({ onClick }) {
  return (
    <button className="button secondary" onClick={onClick}>
      <RefreshCw size={15} />
      Refresh
    </button>
  );
}

export function AlgorithmTrace() {
  const [step, setStep] = useState(0);
  const states = [
    { low: 0, high: 4, mid: 2, decision: '6 < 8 → low = 3' },
    { low: 3, high: 4, mid: 3, decision: '8 = 8 → target found at index 3' },
  ];
  const s = states[step];
  return (
    <section className="algorithm-trace" aria-label="Binary search trace">
      <header>
        <h2>Binary Search</h2>
        <span className="mono">target = 8</span>
      </header>
      <div className="trace-cells">
        {[2, 4, 6, 8, 10].map((v, i) => (
          <div key={v} className={i === s.mid ? 'trace-cell current' : 'trace-cell'}>
            <span className="trace-pointer">
              {i === s.mid ? 'mid' : i === s.low ? 'low' : i === s.high ? 'high' : '—'}
            </span>
            <strong>{v}</strong>
            <span>{i}</span>
          </div>
        ))}
      </div>
      <div className="trace-decision" aria-live="polite">
        <code>{s.decision}</code>
        <button type="button" className="text-button" onClick={() => setStep(step === 0 ? 1 : 0)}>
          {step === 0 ? 'Next step' : 'Reset trace'}
        </button>
      </div>
    </section>
  );
}
