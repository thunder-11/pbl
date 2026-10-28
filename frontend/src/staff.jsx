import React, { useEffect, useState } from 'react';
import { useAuth, useData } from './context';
import { get, post, patch, message } from './api';
import { PageHeading, Panel, Empty, ErrorBox, Loading, Badge, formatPercent } from './components';
export function FacultyPage() {
  const { subjects } = useData(),
    { user } = useAuth(),
    [subject, setSubject] = useState(subjects[0]?.id || ''),
    [rows, setRows] = useState(null),
    [error, setError] = useState(null);
  const load = async () => {
    setRows(null);
    setError(null);
    try {
      setRows(
        await get('/faculty/progress', {
          subjectId: subject,
          pageSize: 100,
          ...(user.role === 'ADMIN'
            ? { reason: 'Department progress review from the faculty screen' }
            : {}),
        }),
      );
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    if (subject) load();
  }, [subject]);
  return (
    <>
      <PageHeading
        title="Student progress"
        description="Only students enrolled in an assigned subject are included."
      />
      <label className="topic-picker">
        Subject
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <ErrorBox error={error} onRetry={load} />
      {rows === null && !error ? (
        <Loading />
      ) : rows?.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th className="num">Completion</th>
                <th className="num">Assessment mean</th>
                <th className="num">Assessed topics</th>
                <th className="num">Mastered topics</th>
                <th className="num">Weak topics</th>
                <th className="num">Successful code</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <td>{r.displayName}</td>
                  <td className="num">{formatPercent(r.completionPercent)}</td>
                  <td className="num">{formatPercent(r.assessmentMeanPercent)}</td>
                  <td className="num">{r.assessedTopicCount}</td>
                  <td className="num">{r.masteredTopicCount}</td>
                  <td className="num">{r.weakTopicIds.length}</td>
                  <td className="num">{r.codingCorrectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <Empty>No active students are enrolled in this subject.</Empty>
      )}
      <p className="quiet-note">
        Student source code,raw answers,private diagnostics and hidden test contents are not
        included in faculty reports.
      </p>
    </>
  );
}
const kinds = [
  ['learningResources', 'Explanations'],
  ['questions', 'Questions'],
  ['assessments', 'Assessments'],
  ['simulations', 'Simulations'],
  ['codingExercises', 'Coding exercises'],
  ['predictionCheckpoints', 'Prediction checkpoints'],
];
const algorithmChoices = [
  'LINEAR_SEARCH',
  'BINARY_SEARCH',
  'BUBBLE_SORT',
  'SELECTION_SORT',
  'INSERTION_SORT',
  'MERGE_SORT',
  'STACK',
  'QUEUE',
  'BST',
  'BFS',
  'DFS',
];
const blank = (kind, topic) => ({
  topicId: topic?.id,
  key: `${topic?.key || 'topic'}-${{ learningResources: 'resource', questions: 'question', assessments: 'assessment', simulations: 'sim', codingExercises: 'exercise', predictionCheckpoints: 'checkpoint' }[kind]}`,
  version: 1,
  status: 'DRAFT',
  title: '',
  content: '',
  prompt: '',
  referenceUrl: null,
  options: ['A', 'B', 'C', 'D'].map((optionId) => ({
    optionId,
    text: '',
    misconceptionCode: null,
  })),
  correctOptionId: 'A',
  explanation: '',
  questionIds: [],
  durationSeconds: 1200,
  algorithm: 'BUBBLE_SORT',
  engineVersion: '1.0.0',
  defaultInput: { array: [3, 2, 1] },
  enabledCheckpointIds: [],
  starters: ['C', 'CPP', 'JAVA', 'PYTHON'].map((language) => ({ language, source: '' })),
  tests: [
    {
      testId: 'sample-1',
      visibility: 'SAMPLE',
      stdin: '',
      expectedStdout: '',
      misconceptionCode: null,
    },
    {
      testId: 'hidden-1',
      visibility: 'HIDDEN',
      stdin: '',
      expectedStdout: '',
      misconceptionCode: null,
    },
  ],
  limits: { cpuSeconds: 2, wallSeconds: 5, memoryKiB: 131072 },
  simulationId: '',
  trigger: { event: 'COMPARE', occurrence: 1 },
  questionType: 'MCQ',
  choices: [
    { choiceId: 'A', label: '', value: 0 },
    { choiceId: 'B', label: '', value: 1 },
  ],
  expectedSelector: 'nextArray',
});
function bodyFor(kind, form) {
  const common = {
    topicId: form.topicId,
    key: form.key,
    version: Number(form.version),
    status: form.status,
  };
  const keys = {
    learningResources: ['title', 'content', 'referenceUrl'],
    questions: ['prompt', 'options', 'correctOptionId', 'explanation'],
    assessments: ['title', 'questionIds', 'durationSeconds'],
    simulations: ['title', 'algorithm', 'engineVersion', 'defaultInput', 'enabledCheckpointIds'],
    codingExercises: ['title', 'prompt', 'starters', 'tests', 'limits'],
    predictionCheckpoints: [
      'simulationId',
      'trigger',
      'questionType',
      'prompt',
      'choices',
      'expectedSelector',
      'explanation',
    ],
  }[kind];
  return { ...common, ...Object.fromEntries(keys.map((k) => [k, form[k]])) };
}
export function ContentPage() {
  const { topics, refresh } = useData(),
    [topic, setTopic] = useState(topics[0]?.id || ''),
    [kind, setKind] = useState('learningResources'),
    [items, setItems] = useState([]),
    [references, setReferences] = useState({ questions: [], simulations: [], checkpoints: [] }),
    [rules, setRules] = useState(null),
    [form, setForm] = useState(null),
    [editing, setEditing] = useState(null),
    [jsonInput, setJsonInput] = useState(''),
    [choiceJson, setChoiceJson] = useState(''),
    [error, setError] = useState(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(null);
  const selected = topics.find((t) => t.id === topic);
  const load = async () => {
    if (!topic) return;
    try {
      const [records, q, s, c, r] = await Promise.all([
        get(`/content/${kind}`, { topicId: topic, pageSize: 100 }),
        get('/content/questions', { topicId: topic, pageSize: 100, status: 'PUBLISHED' }),
        get('/content/simulations', { topicId: topic, pageSize: 100 }),
        get('/content/predictionCheckpoints', { topicId: topic, pageSize: 100 }),
        get('/admin/rules'),
      ]);
      setItems(records);
      setReferences({ questions: q, simulations: s, checkpoints: c });
      setRules(r);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    setForm(null);
    setEditing(null);
    setNotice('');
    setError(null);
    load();
  }, [kind, topic]);
  const begin = (record) => {
    let next = record
      ? {
          ...blank(kind, selected),
          ...record,
          status: 'DRAFT',
          version: record.status === 'DRAFT' ? record.version : record.version + 1,
        }
      : blank(kind, selected);
    if (record?.status === 'PUBLISHED' && kind === 'simulations') next.enabledCheckpointIds = [];
    setForm(next);
    setEditing(record?.status === 'DRAFT' ? record : null);
    setJsonInput(JSON.stringify(next.defaultInput, null, 2));
    setChoiceJson(JSON.stringify(next.choices, null, 2));
    setError(null);
  };
  const update = (key, value) => setForm({ ...form, [key]: value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const draft = { ...form };
      if (kind === 'simulations') draft.defaultInput = JSON.parse(jsonInput);
      if (kind === 'predictionCheckpoints') draft.choices = JSON.parse(choiceJson);
      const body = bodyFor(kind, draft);
      if (editing)
        await patch(`/content/${kind}/${editing.id}`, {
          action: 'UPDATE',
          recordVersion: editing.recordVersion,
          definition: body,
        });
      else if (kind === 'learningResources')
        await post(`/topics/${topic}/resources`, { operation: 'CREATE', resource: body });
      else await post(`/content/${kind}`, body);
      setForm(null);
      setEditing(null);
      setNotice('Draft saved. Review it before publishing.');
      await load();
      await refresh();
    } catch (e) {
      setError(e.response ? e : e.message);
    } finally {
      setBusy(false);
    }
  };
  const action = async (record, action) => {
    setBusy(true);
    setError(null);
    try {
      await patch(`/content/${kind}/${record.id}`, { action, recordVersion: record.recordVersion });
      setNotice(action === 'PUBLISH' ? 'Revision published.' : 'Revision archived.');
      setArchive(null);
      await load();
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        title="Content studio"
        description="Author within your subject scope.Publish reviewed revisions;retain earlier learning history."
        action={
          <button className="button primary" disabled={!topic} onClick={() => begin(null)}>
            Create draft
          </button>
        }
      />
      <div className="filter-toolbar">
        <label>
          Topic
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Content type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBox error={error} />
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {form ? (
        <form className="authoring-form" onSubmit={save}>
          <div className="section-heading">
            <h2>{editing ? 'Edit draft' : 'New revision'}</h2>
            <button type="button" className="text-button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
          <div className="two-column">
            <label>
              Logical content key
              <input
                required
                maxLength={80}
                value={form.key}
                disabled={Boolean(editing)}
                onChange={(e) => update('key', e.target.value)}
              />
              <span className="field-help">
                Lowercase letters,numbers and hyphens. Keep the key when revising existing content.
              </span>
            </label>
            <label>
              Revision number
              <input
                type="number"
                min={1}
                required
                disabled={Boolean(editing)}
                value={form.version}
                onChange={(e) => update('version', Number(e.target.value))}
              />
            </label>
          </div>
          {['learningResources', 'assessments', 'simulations', 'codingExercises'].includes(
            kind,
          ) && (
            <label>
              Title
              <input
                required
                maxLength={120}
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
              />
            </label>
          )}
          {kind === 'learningResources' && (
            <>
              <label>
                Explanation (Markdown)
                <textarea
                  rows={14}
                  required
                  value={form.content}
                  onChange={(e) => update('content', e.target.value)}
                />
              </label>
              <label>
                Reference URL (HTTPS,optional)
                <input
                  type="url"
                  value={form.referenceUrl || ''}
                  onChange={(e) => update('referenceUrl', e.target.value || null)}
                />
              </label>
            </>
          )}
          {['questions', 'codingExercises', 'predictionCheckpoints'].includes(kind) && (
            <label>
              {kind === 'codingExercises' ? 'Exercise prompt' : 'Question prompt'}
              <textarea
                rows={4}
                required
                value={form.prompt}
                onChange={(e) => update('prompt', e.target.value)}
              />
            </label>
          )}
          {kind === 'questions' && (
            <>
              <label>
                Correct option
                <select
                  value={form.correctOptionId}
                  onChange={(e) => {
                    setForm({
                      ...form,
                      correctOptionId: e.target.value,
                      options: form.options.map((o) =>
                        o.optionId === e.target.value ? { ...o, misconceptionCode: null } : o,
                      ),
                    });
                  }}
                >
                  {['A', 'B', 'C', 'D'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {form.options.map((o, index) => (
                <div className="option-author-row" key={o.optionId}>
                  <label>
                    Option {o.optionId}
                    <input
                      required
                      value={o.text}
                      onChange={(e) =>
                        update(
                          'options',
                          form.options.map((v, i) =>
                            i === index ? { ...v, text: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  {o.optionId !== form.correctOptionId && (
                    <label>
                      Misconception mapping
                      <select
                        value={o.misconceptionCode || ''}
                        onChange={(e) =>
                          update(
                            'options',
                            form.options.map((v, i) =>
                              i === index ? { ...v, misconceptionCode: e.target.value || null } : v,
                            ),
                          )
                        }
                      >
                        <option value="">Unclassified</option>
                        {rules?.misconceptions
                          .filter((m) => m.topicId === topic)
                          .map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
              ))}
              <label>
                Feedback explanation
                <textarea
                  rows={3}
                  required
                  value={form.explanation}
                  onChange={(e) => update('explanation', e.target.value)}
                />
              </label>
            </>
          )}
          {kind === 'assessments' && (
            <>
              <label>
                Duration in seconds
                <input
                  type="number"
                  min={300}
                  max={3600}
                  value={form.durationSeconds}
                  onChange={(e) => update('durationSeconds', Number(e.target.value))}
                />
              </label>
              <fieldset>
                <legend>Published questions (select5–20)</legend>
                {references.questions.map((q) => (
                  <label className="check-label" key={q.id}>
                    <input
                      type="checkbox"
                      checked={form.questionIds.includes(q.id)}
                      onChange={(e) =>
                        update(
                          'questionIds',
                          e.target.checked
                            ? [...form.questionIds, q.id]
                            : form.questionIds.filter((v) => v !== q.id),
                        )
                      }
                    />
                    <span>{q.prompt}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {kind === 'simulations' && (
            <>
              <label>
                Algorithm
                <select
                  value={form.algorithm}
                  onChange={(e) => update('algorithm', e.target.value)}
                >
                  {algorithmChoices.map((v) => (
                    <option key={v} value={v}>
                      {v.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default input (JSON)
                <textarea
                  className="code-input"
                  rows={8}
                  required
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                />
              </label>
              <fieldset>
                <legend>Enabled checkpoints</legend>
                <p className="field-help">
                  Save the simulation draft first,then author checkpoints bound to that draft.Edit
                  this draft to enable them before publishing.
                </p>
                {references.checkpoints
                  .filter((c) => editing && c.simulationId === editing.id)
                  .map((c) => (
                    <label key={c.id} className="check-label">
                      <input
                        type="checkbox"
                        checked={form.enabledCheckpointIds.includes(c.id)}
                        onChange={(e) =>
                          update(
                            'enabledCheckpointIds',
                            e.target.checked
                              ? [...form.enabledCheckpointIds, c.id]
                              : form.enabledCheckpointIds.filter((v) => v !== c.id),
                          )
                        }
                      />
                      {c.prompt}
                    </label>
                  ))}
              </fieldset>
            </>
          )}
          {kind === 'codingExercises' && (
            <>
              <h3>Language starters</h3>
              {form.starters.map((s, index) => (
                <label key={s.language}>
                  {s.language}
                  <textarea
                    className="code-input"
                    rows={4}
                    value={s.source}
                    onChange={(e) =>
                      update(
                        'starters',
                        form.starters.map((v, i) =>
                          i === index ? { ...v, source: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <h3>Required test cases</h3>
              {form.tests.map((t, index) => (
                <div className="test-author" key={index}>
                  <div className="two-column">
                    <label>
                      Test identifier
                      <input
                        required
                        value={t.testId}
                        onChange={(e) =>
                          update(
                            'tests',
                            form.tests.map((v, i) =>
                              i === index ? { ...v, testId: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Visibility
                      <select
                        value={t.visibility}
                        onChange={(e) =>
                          update(
                            'tests',
                            form.tests.map((v, i) =>
                              i === index ? { ...v, visibility: e.target.value } : v,
                            ),
                          )
                        }
                      >
                        <option>SAMPLE</option>
                        <option>HIDDEN</option>
                      </select>
                    </label>
                  </div>
                  <div className="two-column">
                    <label>
                      Standard input
                      <textarea
                        rows={3}
                        value={t.stdin}
                        onChange={(e) =>
                          update(
                            'tests',
                            form.tests.map((v, i) =>
                              i === index ? { ...v, stdin: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Expected output
                      <textarea
                        rows={3}
                        value={t.expectedStdout}
                        onChange={(e) =>
                          update(
                            'tests',
                            form.tests.map((v, i) =>
                              i === index ? { ...v, expectedStdout: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={form.tests.length >= 10}
                onClick={() =>
                  update('tests', [
                    ...form.tests,
                    {
                      testId: `hidden-${form.tests.length}`,
                      visibility: 'HIDDEN',
                      stdin: '',
                      expectedStdout: '',
                      misconceptionCode: null,
                    },
                  ])
                }
              >
                Add hidden test
              </button>
            </>
          )}
          {kind === 'predictionCheckpoints' && (
            <>
              <label>
                Simulation draft
                <select
                  required
                  value={form.simulationId}
                  onChange={(e) => update('simulationId', e.target.value)}
                >
                  <option value="">Choose a simulation</option>
                  {references.simulations
                    .filter((s) => s.status === 'DRAFT')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} · revision{s.version}
                      </option>
                    ))}
                </select>
              </label>
              <div className="two-column">
                <label>
                  Trigger event
                  <input
                    required
                    value={form.trigger.event}
                    onChange={(e) => update('trigger', { ...form.trigger, event: e.target.value })}
                  />
                </label>
                <label>
                  Event occurrence
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={form.trigger.occurrence}
                    onChange={(e) =>
                      update('trigger', { ...form.trigger, occurrence: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="two-column">
                <label>
                  Question type
                  <select
                    value={form.questionType}
                    onChange={(e) => update('questionType', e.target.value)}
                  >
                    <option>MCQ</option>
                    <option>STATE_SELECT</option>
                  </select>
                </label>
                <label>
                  Expected next-state field
                  <select
                    value={form.expectedSelector}
                    onChange={(e) => update('expectedSelector', e.target.value)}
                  >
                    {['nextEvent', 'nextArray', 'nextVisited', 'nextIndex'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Candidate states (JSON)
                <textarea
                  rows={8}
                  className="code-input"
                  required
                  value={choiceJson}
                  onChange={(e) => setChoiceJson(e.target.value)}
                />
              </label>
              <label>
                Feedback explanation
                <textarea
                  rows={3}
                  required
                  value={form.explanation}
                  onChange={(e) => update('explanation', e.target.value)}
                />
              </label>
            </>
          )}
          <button className="button primary" type="submit" disabled={busy}>
            Save draft
          </button>
        </form>
      ) : items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Definition</th>
                <th className="num">Revision</th>
                <th>Publication</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title || item.prompt}</strong>
                    <span className="table-subline mono">{item.key}</span>
                  </td>
                  <td className="num">{item.version}</td>
                  <td>
                    <Badge>{item.status.toLowerCase()}</Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="text-button" onClick={() => begin(item)}>
                        {item.status === 'DRAFT' ? 'Edit draft' : 'Create revision'}
                      </button>
                      {item.status === 'DRAFT' && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => action(item, 'PUBLISH')}
                        >
                          Publish
                        </button>
                      )}
                      {item.status !== 'ARCHIVED' && (
                        <button className="text-button" onClick={() => setArchive(item.id)}>
                          Archive
                        </button>
                      )}
                    </div>
                    {archive === item.id && (
                      <div className="inline-confirm">
                        Archive this revision? Existing attempts are retained.
                        <button
                          className="text-button danger-text"
                          disabled={busy}
                          onClick={() => action(item, 'ARCHIVE')}
                        >
                          Confirm archive
                        </button>
                        <button className="text-button" onClick={() => setArchive(null)}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          No definitions of this type exist for the selected topic.Create a draft to add one.
        </Empty>
      )}
    </>
  );
}
export function AdminPage() {
  const { subjects, topics } = useData(),
    [tab, setTab] = useState('accounts'),
    [users, setUsers] = useState([]),
    [rules, setRules] = useState(null),
    [resources, setResources] = useState([]),
    [simulations, setSimulations] = useState([]),
    [auditRows, setAuditRows] = useState([]),
    [error, setError] = useState(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [form, setForm] = useState({
      email: '',
      displayName: '',
      password: '',
      role: 'FACULTY',
      academicYear: null,
      subjectIds: [],
    });
  const load = async () => {
    try {
      const [u, r, a, resource, sim] = await Promise.all([
        get('/admin/users', { pageSize: 100 }),
        get('/admin/rules'),
        get('/admin/audit', { pageSize: 20, order: 'desc' }),
        get('/content/learningResources', { status: 'PUBLISHED', pageSize: 100 }),
        get('/content/simulations', { status: 'PUBLISHED', pageSize: 100 }),
      ]);
      setUsers(u);
      setRules(r);
      setAuditRows(a);
      setResources(resource);
      setSimulations(sim);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const updateUser = async (user, fields) => {
    setBusy(true);
    setError(null);
    try {
      await patch(`/admin/users/${user.id}`, { recordVersion: user.recordVersion, ...fields });
      setNotice('Account permissions updated.');
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const provision = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/admin/users', form);
      setForm({
        email: '',
        displayName: '',
        password: '',
        role: 'FACULTY',
        academicYear: null,
        subjectIds: [],
      });
      setCreating(false);
      setNotice('Account created.');
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      await post('/admin/rules', {
        version: rules.version + 1,
        thresholds: rules.thresholds,
        misconceptions: rules.misconceptions.map(
          ({ code, label, topicId, revisionResourceId, simulationId }) => ({
            code,
            label,
            topicId,
            revisionResourceId,
            simulationId,
          }),
        ),
      });
      setNotice('New rule version activated.');
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        title="Accounts & rules"
        description="Explicit permissions,transparent adaptation and a retained audit trail."
        action={
          tab === 'accounts' && (
            <button className="button primary" onClick={() => setCreating(!creating)}>
              {creating ? 'Close form' : 'Provision account'}
            </button>
          )
        }
      />
      <div className="tabs">
        {[
          ['accounts', 'Accounts'],
          ['rules', 'Recommendation rules'],
          ['audit', 'Audit history'],
        ].map(([key, label]) => (
          <button className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {tab === 'accounts' && (
        <>
          {creating && (
            <form className="authoring-form" onSubmit={provision}>
              <h2>Provision account</h2>
              <div className="two-column">
                <label>
                  Display name
                  <input
                    required
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
                <label>
                  Initial password
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={64}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    aria-describedby="provision-password-help"
                  />
                  <span className="field-help" id="provision-password-help">
                    12–64 characters,letter and digit,at most72 UTF-8 bytes.
                  </span>
                </label>
                <label>
                  Role
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        role: e.target.value,
                        academicYear: e.target.value === 'STUDENT' ? 'TY' : null,
                        subjectIds: [],
                      })
                    }
                  >
                    {['FACULTY', 'STUDENT', 'ADMIN'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {form.role === 'STUDENT' && (
                  <label>
                    Academic year
                    <select
                      value={form.academicYear}
                      onChange={(e) =>
                        setForm({ ...form, academicYear: e.target.value, subjectIds: [] })
                      }
                    >
                      <option>SY</option>
                      <option>TY</option>
                    </select>
                  </label>
                )}
              </div>
              <fieldset>
                <legend>Subject permissions / enrollment</legend>
                {subjects
                  .filter(
                    (s) =>
                      form.role !== 'STUDENT' ||
                      form.academicYear === 'TY' ||
                      s.courseCode === '2301212',
                  )
                  .map((s) => (
                    <label className="check-label" key={s.id}>
                      <input
                        type="checkbox"
                        checked={form.subjectIds.includes(s.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            subjectIds: e.target.checked
                              ? [...form.subjectIds, s.id]
                              : form.subjectIds.filter((v) => v !== s.id),
                          })
                        }
                      />
                      {s.title}
                    </label>
                  ))}
              </fieldset>
              <button className="button primary" disabled={busy}>
                Create account
              </button>
            </form>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Subject permissions</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.displayName}</strong>
                      <span className="table-subline">{u.email}</span>
                    </td>
                    <td>{u.role.toLowerCase()}</td>
                    <td>
                      {u.role === 'ADMIN' ? (
                        <span>Department-wide administration</span>
                      ) : (
                        <div className="assignment-list">
                          {subjects
                            .filter(
                              (s) =>
                                u.role !== 'STUDENT' ||
                                u.academicYear === 'TY' ||
                                s.courseCode === '2301212',
                            )
                            .map((s) => (
                              <label className="check-label" key={s.id}>
                                <input
                                  type="checkbox"
                                  disabled={busy || u.status !== 'ACTIVE'}
                                  checked={u.subjectIds.includes(s.id)}
                                  onChange={(e) =>
                                    updateUser(u, {
                                      subjectIds: e.target.checked
                                        ? [...u.subjectIds, s.id]
                                        : u.subjectIds.filter((v) => v !== s.id),
                                    })
                                  }
                                />
                                {s.courseCode}
                              </label>
                            ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge>{u.status.toLowerCase().replaceAll('_', ' ')}</Badge>
                    </td>
                    <td>
                      {['ACTIVE', 'DISABLED'].includes(u.status) && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            updateUser(u, { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
                          }
                        >
                          {u.status === 'ACTIVE' ? 'Disable' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'rules' &&
        (rules ? (
          <>
            <div className="section-heading">
              <div>
                <h2>Active version{rules.version}</h2>
                <p className="field-help">
                  Changes create an immutable new version. Identical evidence and rules produce
                  identical recommendations.
                </p>
              </div>
              <button className="button primary" disabled={busy} onClick={activate}>
                Activate new version
              </button>
            </div>
            <div className="rule-fields">
              {Object.entries(rules.thresholds).map(([key, value]) => (
                <label key={key}>
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  <input
                    type="number"
                    min={0}
                    max={key.endsWith('Days') ? 90 : 100}
                    disabled={key === 'assessmentWindow'}
                    value={value}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        thresholds: { ...rules.thresholds, [key]: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <h2>Targeted revision mappings</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Misconception</th>
                    <th>Revision material</th>
                    <th>Simulation fallback</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.misconceptions.map((m, i) => (
                    <tr key={m.code}>
                      <td>
                        <strong>{m.label}</strong>
                        <span className="table-subline mono">{m.code}</span>
                      </td>
                      <td>
                        <select
                          aria-label={`Revision material for ${m.label}`}
                          value={m.revisionResourceId}
                          onChange={(e) =>
                            setRules({
                              ...rules,
                              misconceptions: rules.misconceptions.map((v, j) =>
                                i === j ? { ...v, revisionResourceId: e.target.value } : v,
                              ),
                            })
                          }
                        >
                          {resources
                            .filter((r) => r.topicId === m.topicId)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.title} · v{r.version}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label={`Simulation for ${m.label}`}
                          value={m.simulationId || ''}
                          onChange={(e) =>
                            setRules({
                              ...rules,
                              misconceptions: rules.misconceptions.map((v, j) =>
                                i === j ? { ...v, simulationId: e.target.value || null } : v,
                              ),
                            })
                          }
                        >
                          <option value="">No simulation</option>
                          {simulations
                            .filter((s) => s.topicId === m.topicId)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Loading />
        ))}
      {tab === 'audit' && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Summary</th>
                <th>Reason</th>
                <th className="num">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.action}</td>
                  <td>{a.summary}</td>
                  <td>{a.reason || '—'}</td>
                  <td className="num">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
