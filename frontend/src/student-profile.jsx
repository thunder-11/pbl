import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch } from './api';
import { useAuth, useData } from './context';
import { PageHeading, Panel, Loading, ErrorBox, Empty, formatPercent, Badge } from './components';
const stages = {
  FY: 'First year',
  SY: 'Second year',
  TY: 'Third year',
  FINAL: 'Final year',
  GRADUATED: 'Graduated',
};
const date = (v) =>
  new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export default function StudentProfile() {
  const { updateUser } = useAuth(),
    { dashboard: d } = useData();
  const [record, setRecord] = useState(null),
    [form, setForm] = useState(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [notice, setNotice] = useState('');
  const load = () => {
    setError(null);
    get('/users/me/student-profile').then(setRecord).catch(setError);
  };
  useEffect(load, []);
  const edit = () => {
    const v = record.details;
    setForm({
      displayName: record.user.displayName,
      institution: v.institution || '',
      degree: v.degree || '',
      studentNumber: v.studentNumber || '',
      admissionYear: v.admissionYear ?? '',
      graduationYear: v.graduationYear ?? '',
      stage: v.stage || '',
      bio: v.bio || '',
      goals: v.goals || '',
      projects: (v.projects || []).map((p) => ({
        title: p.title,
        description: p.description || '',
        url: p.url || '',
      })),
    });
    setEditing(true);
    setNotice('');
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await patch('/users/me/student-profile', {
        ...form,
        stage: form.stage || null,
        admissionYear: form.admissionYear === '' ? null : Number(form.admissionYear),
        graduationYear: form.graduationYear === '' ? null : Number(form.graduationYear),
      });
      setRecord(next);
      updateUser(next.user);
      setEditing(false);
      setNotice('Profile saved.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const exportProfile = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), ...record, currentLearning: d },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cerebro-student-profile.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!record)
    return (
      <>
        <PageHeading title="Student profile" />
        <ErrorBox error={error} onRetry={load} />
        {!error && <Loading label="Loading your degree record…" />}
      </>
    );
  const { user, details, totals, years, recent, subjects } = record;
  const mastered = d.topics.filter((t) => t.masteryBand === 'MASTERED'),
    weak = d.topics.filter((t) => t.masteryBand === 'WEAK');
  return (
    <>
      <PageHeading
        title="Student profile"
        description="Your academic identity, portfolio and learning record throughout your degree."
        action={
          <div className="button-row">
            <button className="button secondary" onClick={exportProfile}>
              Export profile
            </button>
            {!editing && (
              <button className="button primary" onClick={edit}>
                Edit profile
              </button>
            )}
          </div>
        }
      />
      <ErrorBox error={error} />
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {editing ? (
        <form className="profile-editor" onSubmit={save}>
          <h2>Academic details</h2>
          <p>These details are self-reported. Your learning evidence is recorded separately.</p>
          <div className="profile-fields">
            {[
              ['displayName', 'Display name', 80],
              ['studentNumber', 'Student number', 60],
              ['institution', 'Institution', 160],
              ['degree', 'Degree / programme', 120],
            ].map(([key, label, max]) => (
              <label key={key}>
                {label}
                <input
                  required={key === 'displayName'}
                  maxLength={max}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            {['admissionYear', 'graduationYear'].map((key) => (
              <label key={key}>
                {key === 'admissionYear' ? 'Admission year' : 'Expected / actual graduation year'}
                <input
                  type="number"
                  min="1950"
                  max="2200"
                  step="1"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Degree stage
              <select
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
              >
                <option value="">Not specified</option>
                {Object.entries(stages).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              About you
              <textarea
                maxLength={1000}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </label>
            <label className="profile-wide">
              Learning and career goals
              <textarea
                maxLength={2000}
                value={form.goals}
                onChange={(e) => setForm({ ...form, goals: e.target.value })}
              />
            </label>
          </div>
          <div className="section-heading">
            <h2>Projects</h2>
            <button
              type="button"
              className="button secondary"
              disabled={form.projects.length >= 12}
              onClick={() =>
                setForm({
                  ...form,
                  projects: [...form.projects, { title: '', description: '', url: '' }],
                })
              }
            >
              Add project
            </button>
          </div>
          {form.projects.map((project, i) => (
            <fieldset className="profile-project-form" key={i}>
              <legend>Project {i + 1}</legend>
              {[
                ['title', 'Project title', 120],
                ['description', 'Description', 1000],
                ['url', 'Project link', 500],
              ].map(([key, label, max]) => (
                <label key={key}>
                  {label}
                  <input
                    required={key === 'title'}
                    type={key === 'url' ? 'url' : 'text'}
                    maxLength={max}
                    value={project[key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        projects: form.projects.map((p, j) =>
                          i === j ? { ...p, [key]: e.target.value } : p,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setForm({ ...form, projects: form.projects.filter((_, j) => j !== i) })
                }
              >
                Remove project {i + 1}
              </button>
            </fieldset>
          ))}
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <section className="profile-identity">
            <div className="profile-name">
              <h2>{user.displayName}</h2>
              <span>
                {stages[details.stage] || stages[user.academicYear] || 'Student'} · Joined{' '}
                {date(user.createdAt)}
              </span>
            </div>
            <p>{details.bio || 'Add your academic details and goals to complete your profile.'}</p>
            <dl className="profile-facts">
              {[
                ['Email', user.email],
                ['Student number', details.studentNumber],
                ['Institution', details.institution],
                ['Degree', details.degree],
                ['Admission', details.admissionYear],
                ['Graduation', details.graduationYear],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || 'Not specified'}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="metrics-strip">
            {[
              ['Concept checks', totals.assessmentAttempts],
              ['Coding submissions', totals.codingAttempts],
              ['Simulation sessions', totals.simulationSessions],
              ['Predictions', totals.predictionAttempts],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label} · all time</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="two-column">
            <Panel
              title="Current learning evidence"
              description="Based on your current curriculum and recent graded evidence."
            >
              <dl className="profile-facts">
                <div>
                  <dt>Curriculum completion</dt>
                  <dd>{formatPercent(d.overallCompletionPercent)}</dd>
                </div>
                <div>
                  <dt>Mastered topics</dt>
                  <dd>{mastered.length}</dd>
                </div>
                <div>
                  <dt>Topics to revisit</dt>
                  <dd>{weak.length}</dd>
                </div>
                <div>
                  <dt>Prediction accuracy</dt>
                  <dd>{formatPercent(d.metrics.predictionAccuracyPercent)}</dd>
                </div>
              </dl>
              <Link className="text-button" to="/progress">
                Review topic evidence
              </Link>
            </Panel>
            <Panel title="Learning and career goals" description="Self-reported">
              <p className="profile-prose">
                {details.goals ||
                  'No goals added yet. Use Edit profile to record what you want to work towards.'}
              </p>
            </Panel>
          </div>
          <section className="profile-section">
            <h2>Enrolled subjects</h2>
            {subjects.length ? (
              subjects.map((s) => (
                <Link className="activity-row" key={s.id} to={'/curriculum?subject=' + s.id}>
                  <strong>{s.title}</strong>
                  <span className="mono">{s.courseCode}</span>
                </Link>
              ))
            ) : (
              <Empty>No subjects enrolled.</Empty>
            )}
          </section>
          <section className="profile-section">
            <h2>Projects</h2>
            <p>Self-reported portfolio</p>
            {details.projects?.length ? (
              details.projects.map((p, i) => (
                <article className="profile-project" key={i}>
                  <h3>{p.title}</h3>
                  <p className="profile-prose">{p.description}</p>
                  {p.url && /^https?:\/\//.test(p.url) && (
                    <a
                      className="text-button"
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open project
                    </a>
                  )}
                </article>
              ))
            ) : (
              <Empty>
                Add coursework, personal projects and your final-year project through Edit profile.
              </Empty>
            )}
          </section>
          <section className="profile-section">
            <h2>Degree learning history</h2>
            <p>
              Recorded activity by calendar year. Changing your profile stage does not reset your
              history or change subject access.
            </p>
            {years.length ? (
              <div className="table-scroll">
                <table className="profile-history">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th className="num">Concept checks</th>
                      <th className="num">Coding</th>
                      <th className="num">Simulations</th>
                      <th className="num">Predictions</th>
                      <th className="num">Comparisons</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((y) => (
                      <tr key={y.year}>
                        <th>{y.year}</th>
                        {[
                          'assessmentAttempts',
                          'codingAttempts',
                          'simulationSessions',
                          'predictionAttempts',
                          'comparisonRuns',
                          'total',
                        ].map((k) => (
                          <td className="num" key={k}>
                            {y[k] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Your first recorded activity will start your degree history.</Empty>
            )}
          </section>
          <section className="profile-section">
            <h2>Recent activity</h2>
            <p>
              Latest 20 records across your full learning history, including previous enrollments.
            </p>
            {recent.length ? (
              recent.map((a) => (
                <div className="activity-row" key={a.kind + a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <span>
                      {a.kind} · {date(a.createdAt)}
                    </span>
                  </div>
                  <Badge>
                    {a.scorePercent !== null
                      ? formatPercent(a.scorePercent)
                      : a.status.toLowerCase().replaceAll('_', ' ')}
                  </Badge>
                </div>
              ))
            ) : (
              <Empty>No recorded activities yet.</Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
