import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Play,
  RefreshCw,
  Check,
  Search,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth, useData } from './context';
import { get, post, patch, message } from './api';
import {
  Mark,
  PageHeading,
  Panel,
  Empty,
  ErrorBox,
  Loading,
  Badge,
  ProgressBar,
  formatPercent,
  TopicLink,
  RetryButton,
} from './components';
export function AuthPage() {
  const { login } = useAuth(),
    [mode, setMode] = useState('login'),
    [options, setOptions] = useState([]),
    [demoAccounts, setDemoAccounts] = useState([]),
    [form, setForm] = useState({
      email: '',
      password: '',
      displayName: '',
      academicYear: 'TY',
      subjectIds: [],
    }),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    get('/auth/enrollment-options')
      .then((v) => setOptions(v.subjects))
      .catch(setError);
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch('/__demo-accounts', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setDemoAccounts(data?.accounts || []))
      .catch(() => setDemoAccounts([]));
  }, []);
  const demoSignIn = async (account) => {
    setForm((current) => ({ ...current, email: account.email, password: account.password }));
    setError(null);
    setNotice('');
    setBusy(true);
    try {
      await login({ email: account.email, password: account.password });
      navigate('/');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await post('/auth/register', form);
        setMode('login');
        setNotice('Account created. Sign in to start learning.');
      } else {
        await login({ email: form.email, password: form.password });
        navigate('/');
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-screen">
      <section className="auth-story">
        <div className="brand">
          <Mark />
          <span>
            Trace<span className="brand-subline">Computer Engineering</span>
          </span>
        </div>
        <div className="auth-story-content">
          <h1>
            Make the next step
            <br />
            make sense.
          </h1>
          <p>
            Connect your syllabus to the decisions inside an algorithm. Understand the idea, predict
            what follows, and put it into code.
          </p>
          <div className="auth-algorithm" aria-label="Example Binary Search state">
            <span className="small-label">Binary Search · target8</span>
            <div className="array-preview">
              {[2, 4, 6, 8, 10].map((v, i) => (
                <div key={v} className={i === 2 ? 'current' : ''}>
                  <strong>{v}</strong>
                  <span>{i}</span>
                </div>
              ))}
            </div>
            <div className="example-transition">
              <span>mid =2</span>
              <ArrowRight size={18} />
              <span>6 &lt;8</span>
              <ArrowRight size={18} />
              <strong>low =3</strong>
            </div>
            <p>The interval changes for a reason. See every one.</p>
          </div>
          <div className="auth-courses">
            <span>Data Structures & Algorithms</span>
            <span>Artificial Intelligence</span>
            <span>Database Management Systems</span>
          </div>
        </div>
        <p className="auth-footnote">K. K. Wagh · Computer Engineering · 2023 pattern</p>
      </section>
      <section className="auth-form-section">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              Create student account
            </button>
          </div>
          <h2>{mode === 'login' ? 'Your learning workspace' : 'Start with your syllabus'}</h2>
          <p>
            {mode === 'login'
              ? 'Pick up where your understanding left off.'
              : 'Faculty accounts are provisioned by your department administrator.'}
          </p>
          {notice && (
            <p className="success-message" role="status">
              {notice}
            </p>
          )}
          <ErrorBox error={error} />
          {mode === 'register' && (
            <label>
              Display name
              <input
                required
                maxLength={80}
                autoComplete="name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </label>
          )}
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={mode === 'register' ? 12 : 1}
              maxLength={64}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-describedby={mode === 'register' ? 'password-rules' : undefined}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {mode === 'register' && (
            <>
              <p id="password-rules" className="field-help">
                12–64 characters,at least one letter and one digit;maximum72 UTF-8 bytes.
              </p>
              <label>
                Academic year
                <select
                  value={form.academicYear}
                  onChange={(e) =>
                    setForm({ ...form, academicYear: e.target.value, subjectIds: [] })
                  }
                >
                  <option value="SY">Second Year</option>
                  <option value="TY">Third Year</option>
                </select>
              </label>
              <fieldset>
                <legend>Subject enrollment</legend>
                {options
                  .filter((o) => form.academicYear === 'TY' || o.academicYear === 'SY')
                  .map((o) => (
                    <label className="check-label" key={o.id}>
                      <input
                        type="checkbox"
                        checked={form.subjectIds.includes(o.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            subjectIds: e.target.checked
                              ? [...form.subjectIds, o.id]
                              : form.subjectIds.filter((id) => id !== o.id),
                          })
                        }
                      />
                      <span>
                        {o.title}
                        {form.academicYear === 'TY' && o.academicYear === 'SY'
                          ? ' (SY prerequisite)'
                          : ''}
                      </span>
                    </label>
                  ))}
              </fieldset>
            </>
          )}
          <button disabled={busy} className="button primary" type="submit">
            {busy ? 'Connecting…' : mode === 'login' ? 'Sign in' : 'Create account'}
            <ArrowRight size={16} />
          </button>
          {mode === 'login' && demoAccounts.length > 0 && (
            <div className="development-signin">
              <h3>Explore the demo</h3>
              <p className="field-help">
                Choose a role to sign in instantly. These credentials are for the local demo.
              </p>
              <div className="demo-accounts">
                {demoAccounts.map((account) => (
                  <div className="demo-account" key={account.role}>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => demoSignIn(account)}
                    >
                      Try as {account.role.toLowerCase()} <ArrowRight size={16} />
                    </button>
                    <p>{account.description}</p>
                    <dl>
                      <div>
                        <dt>Email</dt>
                        <dd>{account.email}</dd>
                      </div>
                      <div>
                        <dt>Password</dt>
                        <dd>
                          <code>{account.password}</code>
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
export function Overview() {
  const { user } = useAuth(),
    data = useData();
  if (user.role !== 'STUDENT') return <StaffOverview />;
  const d = data.dashboard,
    r = d.recommendations[0],
    topic = r && data.byId.get(r.topicId),
    mapped = data.topics.length,
    active = data.topics.filter((t) => Object.values(t.availability || {}).some(Boolean)).length;
  return (
    <>
      <PageHeading
        title="Learning overview"
        description="One topic,from the idea to the implementation."
        action={<RetryButton onClick={() => data.refresh().catch(() => {})} />}
      />
      <div className="overview-layout">
        <div className="continue-panel">
          <div className="panel-heading">
            <h2>Your next step</h2>
            <Badge>
              {r
                ? r.reasonCode === 'FIRST_USE'
                  ? 'Getting started'
                  : 'Recommended'
                : 'Ready to explore'}
            </Badge>
          </div>
          <h3>{topic?.title || 'Explore your curriculum'}</h3>
          <p>
            {r?.reasonText || 'Choose a topic to connect explanations,simulation and practice.'}
          </p>
          <Link
            className="button primary"
            to={
              topic
                ? `/topics/${topic.id}?activity=${{ READ: 'understand', SIMULATE: 'simulate', ASSESS: 'assess', CODE: 'code' }[r.activityKind]}`
                : '/curriculum'
            }
          >
            {r
              ? {
                  READ: 'Read the concept',
                  SIMULATE: 'Open simulation',
                  ASSESS: 'Take concept check',
                  CODE: 'Open coding exercise',
                }[r.activityKind]
              : 'Browse topics'}
            <ArrowRight size={16} />
          </Link>
          <div className="continue-evidence">
            <BookOpen size={16} />
            <span>
              {mapped} mapped topics · {active} with learning resources
            </span>
          </div>
        </div>
        <Panel
          title="A complete learning loop"
          description="Each activity records a different kind of evidence."
          className="learning-loop"
        >
          <div>
            {[
              ['Understand', 'Build the concept before applying it.'],
              ['Predict', 'Explain the next algorithmic decision.'],
              ['Practise', 'Use concept checks to find weak spots.'],
              ['Implement', 'Test a solution against required cases.'],
            ].map(([title, copy], i) => (
              <div className="loop-row" key={title}>
                <span className="loop-node">{i + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="metrics-strip">
        <div>
          <span>Curriculum completion</span>
          <strong>{formatPercent(d.overallCompletionPercent)}</strong>
        </div>
        <div>
          <span>Submitted concept checks</span>
          <strong>{d.metrics.assessmentCount}</strong>
        </div>
        <div>
          <span>Successful coding submissions</span>
          <strong>{d.metrics.codingCorrectCount}</strong>
        </div>
        <div>
          <span>Prediction accuracy</span>
          <strong>{formatPercent(d.metrics.predictionAccuracyPercent)}</strong>
        </div>
      </div>
      <div className="two-column">
        <Panel
          title="Your subjects"
          action={
            <Link className="text-button" to="/curriculum">
              View curriculum
              <ArrowUpRight size={14} />
            </Link>
          }
        >
          <div className="subject-progress">
            {d.subjects.map((s) => (
              <div className="subject-progress-row" key={s.subjectId}>
                <div>
                  <Link to={`/curriculum?subject=${s.subjectId}`}>{s.title}</Link>
                  <span>
                    {s.courseCode} · {s.topicCount} topics
                  </span>
                </div>
                <div className="subject-progress-value">
                  <strong>{formatPercent(s.completionPercent)}</strong>
                  <ProgressBar value={s.completionPercent} label={s.title} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Recent learning"
          action={
            <Link className="text-button" to="/progress">
              View progress
              <ArrowUpRight size={14} />
            </Link>
          }
        >
          {d.recentActivity.length ? (
            <div>
              {d.recentActivity.slice(0, 4).map((a) => (
                <Link
                  className="activity-row"
                  key={a.id}
                  to={`/topics/${a.topicId}?activity=${['SIMULATION', 'PREDICTION'].includes(a.activityKind) ? 'simulate' : a.activityKind === 'CODING' ? 'code' : 'assess'}&attempt=${a.sessionId || a.id}`}
                >
                  <div>
                    <strong>{a.title}</strong>
                    <span>
                      {a.activityKind.toLowerCase()} · {a.status.toLowerCase().replaceAll('_', ' ')}
                    </span>
                  </div>
                  <span className="num">
                    {a.scorePercent === null ? (
                      <ChevronRight size={16} />
                    ) : (
                      formatPercent(a.scorePercent)
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              action={
                <Link className="text-button" to="/curriculum">
                  Choose a first topic
                  <ArrowRight size={14} />
                </Link>
              }
            >
              Your completed activities will appear here. Start with the recommended topic above.
            </Empty>
          )}
        </Panel>
      </div>
    </>
  );
}
function StaffOverview() {
  const { user } = useAuth(),
    { subjects, topics } = useData();
  return (
    <>
      <PageHeading
        title={user.role === 'ADMIN' ? 'Department overview' : 'Teaching workspace'}
        description="Curriculum and learning evidence,within your assigned subjects."
      />
      <div className="metrics-strip">
        <div>
          <span>Subjects in scope</span>
          <strong>{subjects.length}</strong>
        </div>
        <div>
          <span>Mapped topics</span>
          <strong>{topics.length}</strong>
        </div>
        <div>
          <span>Topics with resources</span>
          <strong>{topics.filter((t) => t.availability?.understand).length}</strong>
        </div>
      </div>
      <div className="two-column">
        <Panel title="Assigned curriculum">
          {subjects.map((s) => (
            <Link className="activity-row" key={s.id} to={`/curriculum?subject=${s.id}`}>
              <div>
                <strong>{s.title}</strong>
                <span>{s.courseCode}</span>
              </div>
              <ChevronRight size={16} />
            </Link>
          ))}
        </Panel>
        <Panel title="Work with learning evidence">
          <Link className="action-row" to="/faculty">
            <GraduationLabel />
            <span>
              <strong>Review student progress</strong>
              <small>Subject-scoped completion,mastery and outcomes.</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <Link className="action-row" to="/content">
            <BookOpen size={18} />
            <span>
              <strong>Manage teaching content</strong>
              <small>Create revisions and publish reviewed material.</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        </Panel>
      </div>
    </>
  );
}
function GraduationLabel() {
  return <BookOpen size={18} />;
}
export function Curriculum({ simulationsOnly = false }) {
  const { nodes, topics, subjects, dashboard } = useData(),
    [params, setParams] = useSearchParams(),
    [query, setQuery] = useState(params.get('q') || ''),
    [selected, setSelected] = useState(params.get('subject') || 'all'),
    [expanded, setExpanded] = useState(
      new Set(nodes.filter((n) => n.kind === 'UNIT' && n.sortOrder === 1).map((n) => n.id)),
    ),
    { user } = useAuth();
  useEffect(() => {
    setQuery(params.get('q') || '');
    setSelected(params.get('subject') || 'all');
  }, [params]);
  const units = nodes.filter((n) => n.kind === 'UNIT'),
    subjectFor = (t) => units.find((u) => u.id === t.parentId)?.parentId;
  const visible = topics.filter(
    (t) =>
      (selected === 'all' || subjectFor(t) === selected) &&
      (!query ||
        `${t.title} ${subjects.find((s) => s.id === subjectFor(t))?.title}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!simulationsOnly || t.availability?.simulate),
  );
  const toggle = (id) =>
    setExpanded((old) => {
      const n = new Set(old);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <>
      <PageHeading
        title={simulationsOnly ? 'Simulation lab' : 'Your curriculum'}
        description={
          simulationsOnly
            ? 'Real algorithmic state,one decision at a time.'
            : 'Source-mapped to SY Semester IV and TY Semester V,2023 pattern.'
        }
        action={
          user.role !== 'STUDENT' && (
            <Link className="button secondary" to="/curriculum/manage">
              Manage mappings
            </Link>
          )
        }
      />
      <div className="filter-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Filter topics"
            placeholder="Search topics or subjects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by subject"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <span>{visible.length} topics</span>
      </div>
      <div className="curriculum-list">
        {subjects
          .filter((s) => selected === 'all' || s.id === selected)
          .map((subject) => {
            const groups = units
              .filter((u) => u.parentId === subject.id)
              .map((unit) => ({ ...unit, items: visible.filter((t) => t.parentId === unit.id) }))
              .filter((u) => u.items.length);
            if (!groups.length) return null;
            return (
              <section className="course-section" key={subject.id}>
                <div className="course-heading">
                  <div className="course-code">{subject.courseCode}</div>
                  <div>
                    <h2>{subject.title}</h2>
                    <p>
                      {subject.courseCode === '2301212'
                        ? 'SY · Semester IV · DSA foundation'
                        : 'TY · Semester V'}
                    </p>
                  </div>
                </div>
                {groups.map((unit) => {
                  const isOpen = expanded.has(unit.id) || Boolean(query) || simulationsOnly;
                  return (
                    <div className="unit-group" key={unit.id}>
                      <button
                        className="unit-toggle"
                        aria-expanded={isOpen}
                        onClick={() => toggle(unit.id)}
                      >
                        {isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        <span>
                          Unit {unit.sortOrder}
                          <strong>{unit.title}</strong>
                        </span>
                        <span className="unit-count">{unit.items.length} topics</span>
                      </button>
                      {isOpen && (
                        <div className="topic-rows">
                          {unit.items.map((topic) => {
                            const p = dashboard?.topics.find((p) => p.topicId === topic.id),
                              available = Object.values(topic.availability || {}).some(Boolean);
                            return (
                              <Link
                                key={topic.id}
                                className="topic-row"
                                to={`/topics/${topic.id}${simulationsOnly ? '?activity=simulate' : ''}`}
                              >
                                <div>
                                  <strong>{topic.title}</strong>
                                  <span>
                                    {topic.syllabusLabel?.includes('PREREQUISITE')
                                      ? 'Prerequisite support'
                                      : topic.syllabusLabel?.includes('LAB')
                                        ? 'Lab-supported topic'
                                        : available
                                          ? 'Learning resources available'
                                          : 'Syllabus mapping · resources not yet available'}
                                  </span>
                                </div>
                                <div>
                                  {user.role === 'STUDENT' && available ? (
                                    <span className="num">
                                      {formatPercent(p?.completionPercent || 0)}
                                    </span>
                                  ) : (
                                    <Badge>{available ? 'Available' : 'Mapped'}</Badge>
                                  )}
                                  <ChevronRight size={16} />
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        {!visible.length && (
          <Empty>No topics match this search. Try another subject or search term.</Empty>
        )}
      </div>
      <p className="quiet-note">
        SY Semester III and TY Semester VI have no subjects in the current scope. Topic mapping and
        available learning resources are shown separately.
      </p>
    </>
  );
}
export function ProgressPage() {
  const { dashboard: d, refresh, byId } = useData(),
    [filter, setFilter] = useState('ALL');
  const topics = d.topics.filter((t) => filter === 'ALL' || t.masteryBand === filter);
  return (
    <>
      <PageHeading
        title="My progress"
        description="Completion records activity. Mastery comes from recent assessment evidence."
        action={<RetryButton onClick={() => refresh().catch(() => {})} />}
      />
      <div className="metrics-strip">
        <div>
          <span>Overall completion</span>
          <strong>{formatPercent(d.overallCompletionPercent)}</strong>
        </div>
        <div>
          <span>Weak topics</span>
          <strong>{d.metrics.weakTopicIds.length}</strong>
        </div>
        <div>
          <span>Test-pass rate</span>
          <strong>{formatPercent(d.metrics.codingTestPassRatePercent)}</strong>
        </div>
        <div>
          <span>Prediction accuracy</span>
          <strong>{formatPercent(d.metrics.predictionAccuracyPercent)}</strong>
        </div>
      </div>
      <div className="two-column">
        <Panel
          title="Completion by subject"
          description="Includes every published enrolled topic,including those not started."
        >
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart
                data={d.subjects}
                layout="vertical"
                margin={{ left: 0, right: 24, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#edf0f2" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(n) => `${n}%`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="courseCode"
                  width={65}
                  axisLine={false}
                  tickLine={false}
                  fontSize={12}
                />
                <Tooltip
                  formatter={(v) => formatPercent(v)}
                  labelFormatter={(code) => d.subjects.find((s) => s.courseCode === code)?.title}
                />
                <Bar
                  dataKey="completionPercent"
                  name="Completion"
                  fill="#1b6c80"
                  barSize={18}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="What the evidence says">
          {d.metrics.misconceptions.length ? (
            d.metrics.misconceptions.slice(0, 4).map((m, i) => (
              <div className="activity-row" key={i}>
                <div>
                  <strong>{m.label || m.classification.toLowerCase()}</strong>
                  <span>
                    {m.distinctAttemptCount} recent attempt{m.distinctAttemptCount === 1 ? '' : 's'}{' '}
                    · {byId.get(m.topicId)?.title}
                  </span>
                </div>
                {m.recurring && <Badge tone="warning">Recurring</Badge>}
              </div>
            ))
          ) : (
            <Empty>
              Concept checks and graded test outcomes will reveal patterns here. Compilation errors
              are kept separate from conceptual mistakes.
            </Empty>
          )}
        </Panel>
      </div>
      <section className="table-section">
        <div className="section-heading">
          <h2>Topic evidence</h2>
          <select
            aria-label="Filter mastery"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {['ALL', 'INSUFFICIENT', 'WEAK', 'DEVELOPING', 'MASTERED'].map((v) => (
              <option key={v} value={v}>
                {v === 'ALL' ? 'All topics' : v[0] + v.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Topic</th>
                <th>Subject</th>
                <th className="num">Completion</th>
                <th className="num">Mastery</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.topicId}>
                  <td>
                    <TopicLink topic={t} />
                  </td>
                  <td>{d.subjects.find((s) => s.subjectId === t.subjectId)?.courseCode}</td>
                  <td className="num">{formatPercent(t.completionPercent)}</td>
                  <td className="num">{formatPercent(t.masteryPercent)}</td>
                  <td>
                    <Badge
                      tone={
                        t.masteryBand === 'WEAK'
                          ? 'warning'
                          : t.masteryBand === 'MASTERED'
                            ? 'positive'
                            : 'neutral'
                      }
                    >
                      {t.masteryBand === 'INSUFFICIENT'
                        ? 'Not enough evidence'
                        : t.masteryBand.toLowerCase()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
export function AccountSettings() {
  const { user, logout } = useAuth(),
    [form, setForm] = useState({ currentPassword: '', newPassword: '' }),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const change = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await patch('/users/me/password', form);
      await logout();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await post('/users/me/deletion', { currentPassword: form.currentPassword });
      await logout();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading title="Account settings" description={user.email} />
      <ErrorBox error={error} />
      <div className="settings-section">
        <div>
          <h2>Change password</h2>
          <p>Changing your password revokes all current sessions.</p>
        </div>
        <form className="settings-panel" onSubmit={change}>
          <label>
            Current password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            />
          </label>
          <label>
            New password
            <input
              type="password"
              required
              minLength={12}
              maxLength={64}
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              aria-describedby="new-password-help"
            />
          </label>
          <p className="field-help" id="new-password-help">
            12–64 characters,at least one letter and one digit;maximum72 UTF-8 bytes.
          </p>
          <button className="button primary" disabled={busy}>
            Change password
          </button>
        </form>
      </div>
      <div className="settings-section">
        <div>
          <h2>Delete account</h2>
          <p>
            Access ends immediately. Personal learning records are purged after seven days,by the
            eighth day. This cannot be undone.
          </p>
        </div>
        <div className="settings-panel">
          {!confirm ? (
            <button className="button danger" onClick={() => setConfirm(true)}>
              Request account deletion
            </button>
          ) : (
            <>
              <p>
                Delete the account for <strong>{user.email}</strong>? Enter your current password
                above,then confirm.
              </p>
              <button
                className="button danger"
                disabled={busy || !form.currentPassword}
                onClick={remove}
              >
                Confirm deletion
              </button>
              <button className="text-button" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
