import React, { useEffect, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { Play, Check, Code2 } from 'lucide-react';
import { useData } from './context';
import { get, post, newKey } from './api';
import { PageHeading, Panel, Loading, Empty, ErrorBox, Badge } from './components';
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};
loader.config({ monaco });
const languageNames = { C: 'C', CPP: 'C++', JAVA: 'Java', PYTHON: 'Python' },
  editorLanguage = { C: 'c', CPP: 'cpp', JAVA: 'java', PYTHON: 'python' };
const terminal = [
  'PASSED',
  'FAILED_TESTS',
  'RUN_SUCCEEDED',
  'COMPILE_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT',
  'SERVICE_ERROR',
  'SERVICE_TIMEOUT',
];
export function WorkspacePage() {
  const { topics } = useData(),
    available = topics.filter((t) => t.availability?.code),
    [topicId, setTopicId] = useState(available[0]?.id);
  return (
    <>
      <PageHeading
        title="Coding workspace"
        description="Turn the concept into a solution,then check its required tests."
      />
      <label className="topic-picker">
        Exercise topic
        <select value={topicId || ''} onChange={(e) => setTopicId(e.target.value)}>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      {topicId ? (
        <CodingPane key={topicId} topicId={topicId} />
      ) : (
        <Empty>No coding exercises are available in your enrolled subjects.</Empty>
      )}
    </>
  );
}
export function CodingPane({ topicId }) {
  const { refresh } = useData(),
    [data, setData] = useState(null),
    [language, setLanguage] = useState('CPP'),
    [buffers, setBuffers] = useState({}),
    [stdin, setStdin] = useState(''),
    [attempt, setAttempt] = useState(null),
    [history, setHistory] = useState([]),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('output');
  const runKey = useRef(null);
  useEffect(() => {
    get(`/topics/${topicId}/exercises`)
      .then((result) => {
        setData(result);
        const exercise = result.exercises[0];
        if (exercise) {
          setBuffers(Object.fromEntries(exercise.starters.map((s) => [s.language, s.source])));
          setStdin(exercise.sampleTests[0]?.stdin || '');
        }
      })
      .catch(setError);
    get('/coding-attempts', { topicId, pageSize: 20, order: 'desc' })
      .then(setHistory)
      .catch(() => {});
  }, [topicId]);
  useEffect(() => {
    if (!attempt || terminal.includes(attempt.status)) return;
    const t = setTimeout(
      () =>
        get(`/coding-attempts/${attempt.id}`)
          .then((a) => {
            setAttempt(a);
            if (terminal.includes(a.status)) {
              refresh().catch(() => {});
              get('/coding-attempts', { topicId, pageSize: 20, order: 'desc' }).then(setHistory);
            }
          })
          .catch(setError),
      2000,
    );
    return () => clearTimeout(t);
  }, [attempt]);
  const submit = async (mode) => {
    setBusy(true);
    setError(null);
    runKey.current = newKey();
    try {
      const a = await post('/coding-attempts', {
        exerciseId: data.exercises[0].id,
        language,
        mode,
        sourceCode: buffers[language],
        ...(mode === 'RUN' ? { stdin } : {}),
        idempotencyKey: runKey.current,
      });
      setAttempt(a);
      setTab('output');
      get('/coding-attempts', { topicId, pageSize: 20, order: 'desc' }).then(setHistory);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const restore = async (a) => {
    setBusy(true);
    try {
      const r = await get(`/coding-attempts/${a.id}`, { includeSource: true });
      setAttempt(r);
      if (r.sourceMode !== 'FIXTURE') {
        setLanguage(r.language);
        setBuffers((old) => ({ ...old, [r.language]: r.sourceCode }));
        setStdin(r.stdin || '');
      }
      setTab('output');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <>
        <ErrorBox error={error} />
        <Loading />
      </>
    );
  const exercise = data.exercises[0];
  if (!exercise) return <Empty>No coding exercise is published for this topic.</Empty>;
  const unavailable = data.executionMode === 'UNAVAILABLE',
    running = attempt && !terminal.includes(attempt.status);
  return (
    <div className="coding-layout">
      <aside className="exercise-brief">
        <h2>{exercise.title}</h2>
        {exercise.prompt.split('\n').map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <h3>Sample test</h3>
        {exercise.sampleTests.map((t) => (
          <div className="sample-case" key={t.testId}>
            <span>Input</span>
            <pre>{t.stdin}</pre>
            <span>Expected output</span>
            <pre>{t.expectedStdout}</pre>
          </div>
        ))}
        <p className="field-help">
          Supported languages:C,C++,Java and Python. Java submissions use class Main. Passing
          compilation alone does not establish correctness.
        </p>
        <div className="resource-limits">
          <span>CPU2s</span>
          <span>Memory128MiB</span>
          <span>Source32KiB</span>
        </div>
      </aside>
      <section className="editor-area">
        <ErrorBox error={error} />
        {data.executionMode !== 'REAL' && (
          <div className="notice" role="status">
            {unavailable
              ? 'Code execution is currently unavailable. You can still edit your solution.'
              : 'Development mock mode:code will not be compiled or executed. Real grading is unavailable.'}
          </div>
        )}
        <div className="editor-toolbar">
          <label>
            Language
            <select
              aria-label="Programming language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {Object.entries(languageNames).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="editor-file mono">
            {language === 'JAVA'
              ? 'Main.java'
              : language === 'PYTHON'
                ? 'solution.py'
                : language === 'CPP'
                  ? 'solution.cpp'
                  : 'solution.c'}
          </span>
          <Badge>
            {data.executionMode === 'REAL'
              ? 'Isolated execution'
              : unavailable
                ? 'Unavailable'
                : 'Mock'}
          </Badge>
        </div>
        <div className="monaco-frame">
          <Editor
            height="360px"
            language={editorLanguage[language]}
            value={buffers[language] || ''}
            onChange={(value) => setBuffers({ ...buffers, [language]: value || '' })}
            theme="vs"
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              fontFamily: 'IBM Plex Mono',
              fontSize: 13,
              lineHeight: 22,
              scrollBeyondLastLine: false,
              tabSize: 4,
              padding: { top: 16 },
              ariaLabel: 'Solution source code',
              wordWrap: 'on',
            }}
            loading={<Loading label="Loading code editor…" />}
          />
        </div>
        <div className="execution-actions">
          <button
            className="button secondary"
            disabled={busy || running || unavailable || !buffers[language]}
            onClick={() => submit('RUN')}
          >
            <Play size={15} />
            Run with input
          </button>
          <button
            className="button primary"
            disabled={busy || running || data.executionMode !== 'REAL' || !buffers[language]}
            onClick={() => submit('GRADE')}
          >
            <Check size={15} />
            Grade required tests
          </button>
          {running && (
            <span role="status">
              {attempt.status === 'QUEUED'
                ? 'Queued for isolated execution…'
                : 'Execution in progress…'}
            </span>
          )}
        </div>
        <div className="tabs small-tabs">
          <button className={tab === 'output' ? 'active' : ''} onClick={() => setTab('output')}>
            Output & tests
          </button>
          <button className={tab === 'input' ? 'active' : ''} onClick={() => setTab('input')}>
            Standard input
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            Attempt history
          </button>
        </div>
        {tab === 'input' && (
          <label className="stdin-label">
            Custom standard input
            <textarea
              className="code-input"
              rows={5}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              maxLength={8192}
            />
            <span className="field-help">
              Used by Run only. Grading uses all required sample and hidden tests.
            </span>
          </label>
        )}
        {tab === 'output' &&
          (attempt ? (
            <div className="execution-result">
              <div className="result-heading">
                <Badge
                  tone={
                    attempt.correct
                      ? 'positive'
                      : ['COMPILE_ERROR', 'RUNTIME_ERROR', 'FAILED_TESTS'].includes(attempt.status)
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {attempt.status.toLowerCase().replaceAll('_', ' ')}
                </Badge>
                <span>
                  {languageNames[attempt.language]} · {attempt.mode.toLowerCase()}
                </span>
                {attempt.correct && <strong>All required tests passed</strong>}
              </div>
              {attempt.sourceMode !== 'REAL' && (
                <div className="notice">
                  {attempt.sourceMode === 'FIXTURE'
                    ? 'Synthetic historical example. No real compilation or execution is claimed.'
                    : 'Mock output. No real compilation or execution occurred.'}
                </div>
              )}
              {attempt.results.map((r) => (
                <div className="test-result" key={r.testId}>
                  <div>
                    <strong>
                      {r.visibility === 'CUSTOM'
                        ? 'Custom run'
                        : r.visibility === 'HIDDEN'
                          ? 'Hidden test'
                          : 'Sample test'}
                    </strong>
                    <Badge tone={r.passed ? 'positive' : 'neutral'}>
                      {r.outcome.toLowerCase().replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  {r.visibility !== 'HIDDEN' && (
                    <>
                      {r.compileOutput && (
                        <>
                          <h4>Compilation diagnostics</h4>
                          <pre>{r.compileOutput}</pre>
                        </>
                      )}
                      {r.stderr && (
                        <>
                          <h4>Standard error</h4>
                          <pre>{r.stderr}</pre>
                        </>
                      )}
                      <h4>Standard output</h4>
                      <pre>{r.stdout || '(empty)'}</pre>
                      {r.expectedStdout !== undefined && (
                        <>
                          <h4>Expected output</h4>
                          <pre>{r.expectedStdout || '(empty)'}</pre>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
              {['SERVICE_ERROR', 'SERVICE_TIMEOUT'].includes(attempt.status) && (
                <p>
                  The execution service did not return a reliable result. This attempt does not
                  affect correctness or conceptual mastery. A new explicit run is required to retry.
                </p>
              )}
            </div>
          ) : (
            <Empty>
              Run your solution to inspect output,or grade it to check every required test.
            </Empty>
          ))}
        {tab === 'history' &&
          (history.length ? (
            <div className="attempt-history">
              {history.map((a) => (
                <button
                  className="activity-row"
                  key={a.id}
                  onClick={() => restore(a)}
                  disabled={busy}
                >
                  <div>
                    <strong>
                      {languageNames[a.language]} · {a.mode.toLowerCase()}
                    </strong>
                    <span>{a.status.toLowerCase().replaceAll('_', ' ')}</span>
                  </div>
                  <Badge tone={a.sourceMode === 'FIXTURE' ? 'warning' : 'neutral'}>
                    {a.sourceMode === 'FIXTURE'
                      ? 'Synthetic example'
                      : a.sourceMode === 'MOCK'
                        ? 'Mock'
                        : 'Real attempt'}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <Empty>
              No coding attempts yet. Unavailable-service requests do not create an attempt.
            </Empty>
          ))}
      </section>
    </div>
  );
}
