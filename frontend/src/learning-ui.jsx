import React, { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  ArrowRight,
  Check,
  ChevronRight,
  Code2,
} from 'lucide-react';
import { get, post, patch, newKey, errorCode } from './api';
import { useAuth, useData } from './context';
import {
  PageHeading,
  Panel,
  ErrorBox,
  Empty,
  Loading,
  Badge,
  Breadcrumbs,
  WorkflowStrip,
  formatPercent,
} from './components';
const CodingPane = lazy(() => import('./workspace.jsx').then((m) => ({ default: m.CodingPane })));
export function TopicPage() {
  const { topicId } = useParams(),
    { byId, refresh, dashboard } = useData(),
    { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    topic = byId.get(topicId),
    requestedActivity = params.get('activity') || 'understand',
    [resources, setResources] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    setResources(null);
    setError(null);
    get(`/topics/${topicId}/resources`).then(setResources).catch(setError);
  }, [topicId]);
  if (!topic)
    return (
      <Empty>
        Topic not found in your enrolled curriculum.
        <Link className="text-button" to="/curriculum">
          Return to curriculum
        </Link>
      </Empty>
    );
  const progress = dashboard?.topics.find((t) => t.topicId === topicId),
    tabs = [
      ['understand', 'Understand', topic.availability.understand],
      ['simulate', 'Simulate & predict', topic.availability.simulate],
      ['assess', 'Concept check', topic.availability.assess],
      ['code', 'Implement', topic.availability.code],
    ].filter(([, , available]) => available),
    activity = tabs.some(([key]) => key === requestedActivity) ? requestedActivity : tabs[0]?.[0];
  const read = async (id) => {
    setBusy(true);
    setError(null);
    try {
      await post(`/topics/${topicId}/resources`, { operation: 'READ', resourceId: id });
      await refresh();
      setNotice('Reading recorded. Continue with another activity.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Breadcrumbs topic={topic} />
      <PageHeading
        title={topic.title}
        description={
          topic.syllabusLabel?.includes('PREREQUISITE')
            ? 'A prerequisite supporting the DSA learning track.'
            : topic.syllabusLabel?.includes('LAB')
              ? 'A lab-supported part of the Data Structures learning track.'
              : topic.syllabusLabel
        }
        action={
          progress && (
            <div className="topic-summary">
              <strong>{formatPercent(progress.completionPercent)}</strong>
              <span>Topic completion</span>
            </div>
          )
        }
      />
      {user.role === 'STUDENT' && tabs.length > 0 && (
        <WorkflowStrip progress={progress} availability={topic.availability} />
      )}
      {tabs.length > 0 && (
        <div className="tabs" role="tablist" aria-label="Learning activities">
          {tabs.map(([key, title]) => (
            <button
              role="tab"
              aria-selected={activity === key}
              key={key}
              className={activity === key ? 'active' : ''}
              onClick={() => setParams({ activity: key })}
            >
              {title}
            </button>
          ))}
        </div>
      )}
      {!tabs.length && (
        <Empty>Learning activities have not yet been published for this syllabus topic.</Empty>
      )}
      <div className="activity-panel" key={activity}>
        <ErrorBox error={error} />
        {notice && activity === 'understand' && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}
        {activity === 'understand' &&
          (resources === null ? (
            <Loading />
          ) : resources.length ? (
            <div className="reading-layout">
              <article className="reading-content">
                {resources.map((resource) => (
                  <section key={resource.id}>
                    <Markdown
                      components={{
                        h1: ({ children }) => <h2>{children}</h2>,
                        h2: ({ children }) => <h3>{children}</h3>,
                        h3: ({ children }) => <h4>{children}</h4>,
                      }}
                    >
                      {resource.content}
                    </Markdown>
                    {resource.referenceUrl && (
                      <a href={resource.referenceUrl} target="_blank" rel="noreferrer">
                        Reference material
                      </a>
                    )}
                    {user.role === 'STUDENT' && (
                      <div className="reading-actions">
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => read(resource.id)}
                        >
                          <Check size={16} />
                          Mark as read
                        </button>
                        {topic.availability.simulate && (
                          <button
                            className="button secondary"
                            onClick={() => setParams({ activity: 'simulate' })}
                          >
                            Explore the simulation
                            <ArrowRight size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                ))}
              </article>
              <aside className="reading-notes">
                <h2>Make the concept stick</h2>
                <p>Before moving on,explain the invariant in your own words.</p>
                <div className="note-rule" />
                <h3>Your evidence</h3>
                <dl>
                  <div>
                    <dt>Completion</dt>
                    <dd>{formatPercent(progress?.completionPercent || 0)}</dd>
                  </div>
                  <div>
                    <dt>Mastery</dt>
                    <dd>{formatPercent(progress?.masteryPercent)}</dd>
                  </div>
                </dl>
                <p className="field-help">
                  Mastery needs at least two submitted concept checks. Reading alone does not
                  establish it.
                </p>
              </aside>
            </div>
          ) : (
            <Empty>
              Learning resources are not yet available for this mapped topic. Its syllabus position
              is retained; no activity is counted as completed.
            </Empty>
          ))}
        {activity === 'simulate' &&
          (user.role === 'STUDENT' ? (
            topic.availability.simulate ? (
              <SimulationPane key={topicId} topicId={topicId} />
            ) : (
              <Empty>
                No simulator is available for this topic. Use its explanation and concept check
                where available.
              </Empty>
            )
          ) : (
            <Empty>
              Simulation attempts belong to student accounts. Use Content studio to manage the
              definition.
            </Empty>
          ))}
        {activity === 'assess' &&
          (user.role === 'STUDENT' ? (
            topic.availability.assess ? (
              <AssessmentPane key={topicId} topicId={topicId} />
            ) : (
              <Empty>No concept check has been published for this topic.</Empty>
            )
          ) : (
            <Empty>
              Student assessment attempts are private. Review question definitions in Content
              studio.
            </Empty>
          ))}
        {activity === 'code' &&
          (user.role === 'STUDENT' ? (
            topic.availability.code ? (
              <Suspense fallback={<Loading />}>
                <CodingPane key={topicId} topicId={topicId} />
              </Suspense>
            ) : (
              <Empty>
                This topic has no coding exercise. DBMS SQL and PL/SQL are explained and assessed
                without a live database query runner.
              </Empty>
            )
          ) : (
            <Empty>Code execution is available to enrolled student accounts.</Empty>
          ))}
      </div>
    </>
  );
}
function ArrayState({ values, pointers }) {
  const container = useRef(null),
    previous = useRef(new Map()),
    previousValues = useRef([]);
  const occurrences = new Map();
  const items = values.map((value, index) => {
    const occurrence = occurrences.get(value) || 0;
    occurrences.set(value, occurrence + 1);
    return { value, index, key: `${value}:${occurrence}` };
  });
  useLayoutEffect(() => {
    const next = new Map();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const cell of container.current?.querySelectorAll('[data-value-key]') || []) {
      const position = cell.offsetLeft,
        old = previous.current.get(cell.dataset.valueKey);
      next.set(cell.dataset.valueKey, position);
      if (!reduced && old !== undefined && old !== position)
        cell
          .querySelector('.array-value')
          .animate(
            [{ transform: `translateX(${old - position}px)` }, { transform: 'translateX(0)' }],
            { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
          );
    }
    previous.current = next;
    previousValues.current = [...values];
  }, [values]);
  return (
    <div className="array-state" aria-label="Algorithm array" ref={container}>
      <div className="array-cells">
        {items.map(({ value, index: i, key }) => {
          const labels = Object.entries(pointers || {})
            .filter(
              ([k, v]) => ['low', 'high', 'mid', 'i', 'j', 'targetIndex'].includes(k) && v === i,
            )
            .map(([k]) => k);
          return (
            <div
              className={`array-cell ${labels.includes('mid') || labels.includes('j') || labels.includes('i') ? 'is-current' : ''} ${labels.includes('targetIndex') ? 'is-found' : ''} ${previousValues.current.length && previousValues.current[i] !== value ? 'is-changed' : ''}`}
              key={key}
              data-value-key={key}
            >
              <div className="pointer-label">
                {labels.map((label) => (
                  <span key={label}>{label === 'targetIndex' ? 'found' : label}</span>
                ))}
              </div>
              <div className="array-value">{value}</div>
              <span className="array-index">{i}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function GraphState({ state }) {
  const vertices = state.graph.vertices,
    positions = Object.fromEntries(
      vertices.map((v, i) => [
        v,
        {
          x: 260 + 180 * Math.cos((2 * Math.PI * i) / vertices.length - Math.PI / 2),
          y: 145 + 100 * Math.sin((2 * Math.PI * i) / vertices.length - Math.PI / 2),
        },
      ]),
    );
  return (
    <svg
      className="graph-canvas"
      viewBox="0 0 520 290"
      role="img"
      aria-label={`Graph state.Visited ${state.visited.join(', ') || 'none'}`}
    >
      <defs>
        <marker id="arrow" markerWidth="7" markerHeight="7" refX="27" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7" fill="#a3acb1" />
        </marker>
      </defs>
      {state.graph.edges.map((e, i) => (
        <line
          key={i}
          x1={positions[e.from].x}
          y1={positions[e.from].y}
          x2={positions[e.to].x}
          y2={positions[e.to].y}
          className={
            state.visited.includes(e.from) && state.visited.includes(e.to)
              ? 'graph-edge visited'
              : 'graph-edge'
          }
          stroke={
            state.visited.includes(e.from) && state.visited.includes(e.to) ? '#188b72' : '#c5cdd2'
          }
          strokeWidth="1.6"
          markerEnd={state.graph.directed ? 'url(#arrow)' : undefined}
        />
      ))}
      {vertices.map((v) => (
        <g
          key={v}
          className={`graph-node ${state.visited.includes(v) ? 'visited' : ''} ${state.pointers.currentNodeId === v ? 'current-node' : ''}`}
        >
          <circle
            cx={positions[v].x}
            cy={positions[v].y}
            r="22"
            fill={state.visited.includes(v) ? '#e7f2f4' : '#fff'}
            stroke={state.pointers.currentNodeId === v ? '#1b6c80' : '#a3acb1'}
            strokeWidth={state.pointers.currentNodeId === v ? 2 : 1}
          />
          <text
            x={positions[v].x}
            y={positions[v].y + 5}
            textAnchor="middle"
            fill="#131416"
            fontSize="15"
          >
            {v}
          </text>
        </g>
      ))}
    </svg>
  );
}
function TreeState({ state }) {
  if (!state.tree.length) return <div className="canvas-empty">The tree is empty.</div>;
  const children = new Set(state.tree.flatMap((n) => [n.leftId, n.rightId]).filter(Boolean)),
    root = state.tree.find((n) => !children.has(n.nodeId)),
    positions = {},
    byId = new Map(state.tree.map((n) => [n.nodeId, n]));
  const place = (id, x, y, gap) => {
    if (!id || !byId.has(id)) return;
    positions[id] = { x, y };
    let n = byId.get(id);
    place(n.leftId, x - gap, y + 64, gap / 2);
    place(n.rightId, x + gap, y + 64, gap / 2);
  };
  if (root) place(root.nodeId, 300, 35, 140);
  const height = Math.max(200, ...Object.values(positions).map((p) => p.y + 32));
  return (
    <svg
      className="tree-canvas"
      viewBox={`0 0 600 ${height}`}
      role="img"
      aria-label={`Binary search tree with ${state.tree.length} nodes`}
    >
      {state.tree.flatMap((n) =>
        [n.leftId, n.rightId]
          .filter((id) => positions[id] && positions[n.nodeId])
          .map((id) => (
            <line
              key={`${n.nodeId}-${id}`}
              x1={positions[n.nodeId].x}
              y1={positions[n.nodeId].y}
              x2={positions[id].x}
              y2={positions[id].y}
              stroke="#c5cdd2"
              strokeWidth="1.5"
            />
          )),
      )}
      {state.tree
        .filter((n) => positions[n.nodeId])
        .map((n) => (
          <g
            key={n.nodeId}
            className={`tree-node ${state.pointers.currentNodeId === n.nodeId ? 'current-node' : ''}`}
            style={{
              transform: `translate(${positions[n.nodeId].x}px, ${positions[n.nodeId].y}px)`,
            }}
          >
            <circle
              cx={0}
              cy={0}
              r="20"
              fill={state.visited.includes(n.value) ? '#e7f2f4' : 'white'}
              stroke={state.pointers.currentNodeId === n.nodeId ? '#1b6c80' : '#a3acb1'}
              strokeWidth={state.pointers.currentNodeId === n.nodeId ? 2 : 1}
            />
            <text x={0} y={5} textAnchor="middle" fontSize="14" fill="#131416">
              {n.value}
            </text>
          </g>
        ))}
    </svg>
  );
}
export function SimulationPane({ topicId }) {
  const { refresh } = useData(),
    [params, setParams] = useSearchParams(),
    [definitions, setDefinitions] = useState(null),
    [selected, setSelected] = useState(null),
    [input, setInput] = useState(''),
    [session, setSession] = useState(null),
    [prediction, setPrediction] = useState(null),
    [choice, setChoice] = useState(''),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [playing, setPlaying] = useState(false);
  const latest = useRef(null);
  const inFlight = useRef(false),
    autoStartKey = useRef(newKey()),
    autoResume = useRef(true),
    feedbackUntil = useRef(0);
  latest.current = session;
  useEffect(() => {
    let active = true;
    setBusy(true);
    get(`/topics/${topicId}/simulations`)
      .then(async (list) => {
        if (!active) return;
        setDefinitions(list);
        if (list[0]) {
          setSelected(list[0]);
          setInput(JSON.stringify(list[0].defaultInput, null, 2));
        }
        const existing = params.get('attempt');
        if (existing && list.length)
          try {
            const s = await patch(`/simulation-sessions/${existing}`, { command: 'SYNC' });
            if (s.topicId === topicId) {
              if (!active) return;
              setSelected(list.find((definition) => definition.id === s.simulationId) || list[0]);
              setInput(JSON.stringify(s.input, null, 2));
              latest.current = s;
              setSession(s);
              await updatePrediction(s);
              await resume(s);
              return;
            }
          } catch {}
        if (active && list[0]) {
          try {
            const s = await post('/simulation-sessions', {
              simulationId: list[0].id,
              input: list[0].defaultInput,
              idempotencyKey: autoStartKey.current,
            });
            if (!active) return;
            latest.current = s;
            setSession(s);
            setParams({ activity: 'simulate', attempt: s.id }, { replace: true });
            await updatePrediction(s);
            await resume(s);
          } catch (error) {
            if (active) setError(error);
          }
        }
      })
      .catch(setError)
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [topicId]);
  const resume = async (s) => {
    if (!s || s.pendingPredictionId || s.state.done) return;
    const next = await patch(`/simulation-sessions/${s.id}`, {
      command: 'PLAY',
      recordVersion: s.recordVersion,
    });
    latest.current = next;
    setSession(next);
    setPlaying(true);
  };
  const updatePrediction = async (s) => {
    if (!s.predictionId) {
      setPrediction(null);
      return;
    }
    const defs = await get(`/simulations/${s.simulationId}/checkpoints`),
      cp = defs.find((c) => String(c.id) === String(s.checkpointId));
    if (!cp) return;
    const p = await post('/prediction-attempts', {
      sessionId: s.id,
      checkpointId: cp.id,
      cursor: s.cursor,
      stateHash: s.currentStateHash,
    });
    setPrediction({ ...p, definition: cp });
    setChoice('');
  };
  const control = async (command, extra = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = latest.current,
        s = await patch(`/simulation-sessions/${current.id}`, {
          command,
          recordVersion: current.recordVersion,
          ...extra,
        });
      latest.current = s;
      setSession(s);
      if (s.status === 'COMPLETED') {
        setPlaying(false);
        refresh().catch(() => {});
      }
      if (s.status === 'PAUSED' && s.pendingPredictionId) setPlaying(false);
      await updatePrediction(s);
      return s;
    } catch (e) {
      setError(e);
      setPlaying(false);
      throw e;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (
      !playing ||
      busy ||
      !session ||
      session.pendingPredictionId ||
      session.status === 'COMPLETED'
    )
      return;
    const timer = setTimeout(
      () => control('NEXT').catch(() => {}),
      Math.max(1200 / session.speed, feedbackUntil.current - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [
    playing,
    busy,
    session?.cursor,
    session?.speed,
    session?.recordVersion,
    session?.pendingPredictionId,
  ]);
  const start = async (definition = selected, rawInput = input) => {
    setPlaying(false);
    setBusy(true);
    setError(null);
    try {
      let parsed;
      try {
        parsed = JSON.parse(rawInput);
      } catch {
        throw new Error('Enter valid JSON for the algorithm input.');
      }
      const s = await post('/simulation-sessions', {
        simulationId: definition.id,
        input: parsed,
        idempotencyKey: newKey(),
      });
      latest.current = s;
      setSession(s);
      setPrediction(null);
      autoResume.current = true;
      setParams({ activity: 'simulate', attempt: s.id }, { replace: true });
      await updatePrediction(s);
      await resume(s);
    } catch (e) {
      setError(e.response ? e : e.message);
    } finally {
      setBusy(false);
    }
  };
  const respond = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const p = await post(`/prediction-attempts/${prediction.id}/responses`, {
        action,
        ...(action === 'ANSWER' ? { choiceId: choice } : {}),
        cursor: session.cursor,
        stateHash: session.currentStateHash,
        recordVersion: prediction.recordVersion,
      });
      setPrediction({ ...p, definition: prediction.definition });
      feedbackUntil.current = Date.now() + (action === 'ANSWER' ? 3500 : 1200);
      const synced = await patch(`/simulation-sessions/${session.id}`, { command: 'SYNC' });
      latest.current = synced;
      setSession(synced);
      if (autoResume.current && !synced.pendingPredictionId) await resume(synced);
      refresh().catch(() => {});
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  if (definitions === null) return <Loading />;
  if (!definitions.length) return <Empty>No published simulator is available.</Empty>;
  const state = session?.state;
  return (
    <div className="simulation-layout">
      <section className="simulation-main">
        <div className="simulation-toolbar">
          <div>
            <h2>{selected?.title}</h2>
            <span className="field-help">Deterministic algorithm state · engine1.0.0</span>
          </div>
          {session && (
            <Badge tone={state.done ? 'positive' : 'neutral'}>
              {state.done ? 'Complete' : `Step ${session.cursor} of ${session.traceLength - 1}`}
            </Badge>
          )}
        </div>
        <ErrorBox error={error} />
        {session && (
          <div className="simulation-playback-status" role="status">
            <span className={`playback-indicator ${playing ? 'running' : ''}`} />
            {state.done
              ? 'Simulation complete'
              : session.pendingPredictionId
                ? 'Your turn · answer or skip to continue'
                : playing
                  ? 'Playing automatically'
                  : 'Playback paused'}
          </div>
        )}
        {session?.sourceMode === 'FIXTURE' && (
          <div className="notice">
            Synthetic history. This session does not contribute to real progress.
          </div>
        )}
        {prediction && (
          <section className="prediction-card">
            <header>
              <h3>Predict the next step</h3>
              <Badge
                tone={
                  prediction.status === 'ANSWERED'
                    ? prediction.firstCorrect
                      ? 'positive'
                      : 'warning'
                    : 'neutral'
                }
              >
                {prediction.status === 'PENDING'
                  ? 'Playback paused'
                  : prediction.status === 'SKIPPED'
                    ? 'Skipped'
                    : prediction.firstCorrect
                      ? 'Correct first answer'
                      : 'Learning from a mistake'}
              </Badge>
            </header>
            <p>{prediction.definition.prompt}</p>
            <fieldset
              disabled={busy || prediction.status === 'SKIPPED' || prediction.responses.length >= 2}
            >
              {prediction.definition.choices.map((c) => (
                <label
                  className={`prediction-choice ${choice === c.choiceId ? 'selected' : ''}`}
                  key={c.choiceId}
                >
                  <input
                    type="radio"
                    name="prediction"
                    value={c.choiceId}
                    checked={choice === c.choiceId}
                    onChange={() => setChoice(c.choiceId)}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </fieldset>
            {prediction.feedback && (
              <p className="prediction-feedback" role="status">
                {prediction.feedback.explanation}
                {prediction.responses.length === 2
                  ? ' Your first answer remains the scored answer.'
                  : ''}
              </p>
            )}
            <div className="button-row">
              {prediction.responses.length < 2 && prediction.status !== 'SKIPPED' && (
                <button
                  className="button primary"
                  disabled={busy || !choice}
                  onClick={() => respond('ANSWER')}
                >
                  {prediction.status === 'PENDING' ? 'Check prediction' : 'Try once more'}
                </button>
              )}
              {prediction.status === 'PENDING' && (
                <button className="text-button" disabled={busy} onClick={() => respond('SKIP')}>
                  Skip checkpoint
                </button>
              )}
            </div>
          </section>
        )}
        <div className={`algorithm-canvas ${playing ? 'is-playing' : ''}`}>
          {!state ? (
            <>
              <ArrayState
                values={selected.defaultInput.array || selected.defaultInput.initial || []}
                pointers={{}}
              />
              {selected.defaultInput.vertices && (
                <GraphState state={{ graph: selected.defaultInput, visited: [], pointers: {} }} />
              )}
              <p className="canvas-caption">Inspect the input,then start the simulation.</p>
            </>
          ) : (
            <>
              {state.graph ? (
                <GraphState state={state} />
              ) : selected.algorithm === 'BST' ? (
                <TreeState state={state} />
              ) : state.array.length ? (
                <ArrayState values={state.array} pointers={state.pointers} />
              ) : (
                <>
                  <span className="small-label">
                    {selected.algorithm === 'STACK'
                      ? 'Stack · bottom to top'
                      : 'Queue · front to rear'}
                  </span>
                  <ArrayState
                    values={selected.algorithm === 'STACK' ? state.stack : state.queue}
                    pointers={{}}
                  />
                  {!(selected.algorithm === 'STACK' ? state.stack : state.queue).length && (
                    <div className="canvas-empty">The container is empty.</div>
                  )}
                </>
              )}
              <div
                className="state-message"
                key={`${session.id}:${session.cursor}`}
                aria-live="polite"
              >
                <span>{state.event.toLowerCase().replaceAll('_', ' ')}</span>
                <p>{state.message}</p>
              </div>
            </>
          )}
        </div>
        {session && (
          <>
            <div
              className="simulation-timeline"
              role="progressbar"
              aria-label="Simulation steps"
              aria-valuemin={0}
              aria-valuemax={session.traceLength - 1}
              aria-valuenow={session.cursor}
            >
              <span
                style={{
                  width: `${(100 * session.cursor) / Math.max(1, session.traceLength - 1)}%`,
                }}
              />
            </div>
            <div className="playback-controls">
              <button
                className="icon-button"
                title="Previous state"
                aria-label="Previous state"
                disabled={busy || !session.cursor || playing}
                onClick={() => control('PREVIOUS').catch(() => {})}
              >
                <SkipBack size={18} />
              </button>
              <button
                className="button primary"
                disabled={busy || session.pendingPredictionId || state.done}
                onClick={async () => {
                  try {
                    autoResume.current = !playing;
                    await control(playing ? 'PAUSE' : 'PLAY');
                    setPlaying(!playing);
                  } catch {}
                }}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}
              </button>
              <button
                className="button secondary"
                disabled={busy || state.done || playing || Boolean(session.pendingPredictionId)}
                onClick={() => control('NEXT').catch(() => {})}
              >
                Next step
                <SkipForward size={16} />
              </button>
              <button
                className="icon-button"
                title="Reset simulation"
                aria-label="Reset simulation"
                disabled={busy}
                onClick={() => {
                  setPlaying(false);
                  autoResume.current = false;
                  control('RESET').catch(() => {});
                }}
              >
                <RotateCcw size={17} />
              </button>
              <label className="speed-control">
                Speed
                <select
                  aria-label="Animation speed"
                  value={session.speed}
                  onChange={(e) =>
                    control('SPEED', { speed: Number(e.target.value) }).catch(() => {})
                  }
                >
                  {[0.5, 1, 2, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="operation-counts">
              {Object.entries(state.counters)
                .filter(([k]) => k !== 'visits' || state.graph || selected.algorithm === 'BST')
                .map(([key, value]) => (
                  <div key={key}>
                    <span>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                    <strong key={value} className="counter-value">
                      {value}
                    </strong>
                  </div>
                ))}
            </div>
            {session.predictionAvailability === 'DEFAULT_INPUT_ONLY' && (
              <p className="field-help">
                Prediction checkpoints are available on this simulator's default input.
              </p>
            )}
          </>
        )}
      </section>
      <aside className="simulation-inspector">
        <h2>Input & state</h2>
        {definitions.length > 1 && (
          <label>
            Algorithm
            <select
              value={selected.id}
              disabled={busy}
              onChange={(e) => {
                const s = definitions.find((d) => d.id === e.target.value);
                setSelected(s);
                setInput(JSON.stringify(s.defaultInput, null, 2));
                setSession(null);
                setPrediction(null);
                setPlaying(false);
                autoResume.current = true;
                start(s, JSON.stringify(s.defaultInput, null, 2));
              }}
            >
              {definitions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Algorithm input (JSON)
          <textarea
            className="code-input"
            rows={8}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </label>
        <p className="field-help">
          Arrays:1–32 integers from−999 to999. Binary Search needs sorted input. Graph neighbors are
          visited alphabetically.
        </p>
        <button
          className={`button ${session ? 'secondary' : 'primary'} full-width`}
          disabled={busy}
          onClick={() => start()}
        >
          {session ? 'Start a new session' : 'Start simulation'}
        </button>
        {state && (
          <>
            <h3>Current pointers</h3>
            <dl className="state-values">
              {Object.entries(state.pointers)
                .filter(([, v]) => v !== null)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {state.graph && (
              <>
                <h3>{selected.algorithm === 'BFS' ? 'Queue' : 'Visited order'}</h3>
                <p className="mono">
                  [{(selected.algorithm === 'BFS' ? state.queue : state.visited).join(', ')}]
                </p>
              </>
            )}
            {state.recursionFrames.length > 0 && (
              <>
                <h3>Call stack</h3>
                <div className="frame-list">
                  {state.recursionFrames.map((f, i) => (
                    <code key={i}>
                      {f.nodeId ? `${f.nodeId} · ${f.phase}` : `[${f.low},${f.high}] · ${f.phase}`}
                    </code>
                  ))}
                </div>
              </>
            )}
            {state.visited.length > 0 && (
              <>
                <h3>Output / visited</h3>
                <p className="mono">[{state.visited.join(', ')}]</p>
              </>
            )}
          </>
        )}
        <p className="quiet-note">
          Playback changes presentation speed. It never changes the algorithm or its operation
          counts.
        </p>
      </aside>
    </div>
  );
}
export function AssessmentPane({ topicId }) {
  const { refresh } = useData(),
    [params, setParams] = useSearchParams(),
    [defs, setDefs] = useState(null),
    [attempt, setAttempt] = useState(null),
    [answers, setAnswers] = useState({}),
    [question, setQuestion] = useState(0),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    finalKey = useRef(newKey());
  useEffect(() => {
    get(`/topics/${topicId}/assessments`)
      .then(async (list) => {
        setDefs(list);
        let identifier = params.get('attempt');
        if (identifier)
          try {
            const a = await post(`/assessment-attempts/${identifier}/finalize`, { action: 'SYNC' });
            if (a.topicId === topicId) load(a);
          } catch {}
      })
      .catch(setError);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [topicId]);
  function load(a) {
    setAttempt(a);
    setAnswers(Object.fromEntries(a.answers.map((x) => [x.questionId, x.optionId])));
    setQuestion(0);
    finalKey.current = newKey();
  }
  const start = async (definition) => {
    setBusy(true);
    setError(null);
    try {
      const existing = await get('/assessment-attempts', {
        assessmentId: definition.id,
        status: 'IN_PROGRESS',
      });
      const a = existing.length
        ? await post(`/assessment-attempts/${existing[0].id}/finalize`, { action: 'SYNC' })
        : await post('/assessment-attempts', {
            assessmentId: definition.id,
            idempotencyKey: newKey(),
          });
      load(a);
      setParams({ activity: 'assess', attempt: a.id }, { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (attempt.status !== 'IN_PROGRESS') return attempt;
    const body = Object.entries(answers).map(([questionId, optionId]) => ({
      questionId,
      optionId,
    }));
    if (!body.length) return attempt;
    const a = await patch(`/assessment-attempts/${attempt.id}/answers`, {
      recordVersion: attempt.recordVersion,
      answers: body,
    });
    setAttempt(a);
    return a;
  };
  const finish = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const current = action === 'SUBMIT' ? await save() : attempt;
      const a = await post(`/assessment-attempts/${attempt.id}/finalize`, {
        action,
        recordVersion: current.recordVersion,
        idempotencyKey: finalKey.current,
      });
      setAttempt(a);
      await refresh();
    } catch (e) {
      setError(e);
      if (errorCode(e) === 'ATTEMPT_EXPIRED') {
        const a = await post(`/assessment-attempts/${attempt.id}/finalize`, { action: 'SYNC' });
        setAttempt(a);
      }
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (attempt?.status === 'IN_PROGRESS' && new Date(attempt.deadlineAt) <= now)
      post(`/assessment-attempts/${attempt.id}/finalize`, { action: 'SYNC' })
        .then(setAttempt)
        .catch(setError);
  }, [now, attempt?.status]);
  if (defs === null) return <Loading />;
  if (!attempt)
    return (
      <div className="assessment-intro">
        <ErrorBox error={error} />
        {defs.map((d) => (
          <Panel
            key={d.id}
            title={d.title}
            description={`${d.questionCount} questions · ${d.durationSeconds / 60} minutes · one point per answer`}
          >
            <p>
              Submit all answers to record a score. Repeated submissions contribute to recent topic
              mastery; at least two are needed to classify understanding.
            </p>
            <button className="button primary" disabled={busy} onClick={() => start(d)}>
              Start concept check
              <ArrowRight size={16} />
            </button>
          </Panel>
        ))}
      </div>
    );
  const done = attempt.status !== 'IN_PROGRESS',
    q = attempt.questions[question],
    remaining = Math.max(0, Math.ceil((new Date(attempt.deadlineAt) - now) / 1000));
  return (
    <div className="assessment-layout">
      <div>
        <ErrorBox error={error} />
        {attempt.sourceMode === 'FIXTURE' && (
          <div className="notice">Synthetic history. Not included in real mastery.</div>
        )}
        <div className="assessment-title">
          <h2>
            {done
              ? 'Assessment feedback'
              : `Question ${question + 1} of ${attempt.questions.length}`}
          </h2>
          {done ? (
            <Badge tone={attempt.status === 'SUBMITTED' ? 'positive' : 'neutral'}>
              {attempt.status.toLowerCase()}
            </Badge>
          ) : (
            <span className="mono" role="timer" aria-label="Time remaining">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        {done ? (
          <>
            <div className="assessment-result">
              <strong>
                {attempt.scorePercent === null ? '—' : formatPercent(attempt.scorePercent)}
              </strong>
              <p>
                {attempt.status === 'SUBMITTED'
                  ? 'Your answers were submitted and recorded.'
                  : attempt.status === 'EXPIRED'
                    ? 'This attempt expired and does not count toward mastery.'
                    : 'This attempt was abandoned and does not count toward mastery.'}
              </p>
            </div>
            {attempt.questions.map((item, i) => (
              <section className="answer-feedback" key={item.questionId}>
                <h3>
                  {i + 1}. {item.prompt}
                </h3>
                <p>
                  Your answer:{' '}
                  {item.options.find((o) => o.optionId === answers[item.questionId])?.text ||
                    'Not answered'}
                </p>
                {item.correctOptionId && (
                  <>
                    <p
                      className={
                        answers[item.questionId] === item.correctOptionId
                          ? 'success-message'
                          : 'correct-answer'
                      }
                    >
                      Expected:{' '}
                      {item.options.find((o) => o.optionId === item.correctOptionId)?.text}
                    </p>
                    <p className="field-help">{item.explanation}</p>
                  </>
                )}
              </section>
            ))}
            <button
              className="button secondary"
              onClick={() => {
                setAttempt(null);
                setParams({ activity: 'assess' });
                setError(null);
              }}
            >
              Return to concept checks
            </button>
          </>
        ) : (
          <>
            <h3 className="question-prompt">{q.prompt}</h3>
            <fieldset className="answer-options" disabled={busy}>
              <legend className="sr-only">Choose one answer</legend>
              {q.options.map((o) => (
                <label
                  key={o.optionId}
                  className={answers[q.questionId] === o.optionId ? 'selected' : ''}
                >
                  <input
                    type="radio"
                    name={`question-${q.questionId}`}
                    checked={answers[q.questionId] === o.optionId}
                    onChange={() => setAnswers({ ...answers, [q.questionId]: o.optionId })}
                  />
                  <span className="option-letter">{o.optionId}</span>
                  <span>{o.text}</span>
                </label>
              ))}
            </fieldset>
            <div className="assessment-controls">
              <button
                className="button secondary"
                disabled={busy || question === 0}
                onClick={() => setQuestion(question - 1)}
              >
                Previous
              </button>
              <button
                className="button secondary"
                disabled={busy || question === attempt.questions.length - 1}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await save();
                    setQuestion(question + 1);
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save & next
              </button>
              <button
                className="button primary"
                disabled={busy || Object.keys(answers).length !== attempt.questions.length}
                onClick={() => finish('SUBMIT')}
              >
                Submit assessment
              </button>
            </div>
          </>
        )}
      </div>
      <aside className="assessment-sidebar">
        <h2>Answer overview</h2>
        <div className="question-grid">
          {attempt.questions.map((q, i) => (
            <button
              className={answers[q.questionId] ? 'answered' : ''}
              aria-label={`Question ${i + 1}${answers[q.questionId] ? ',answered' : ''}`}
              key={q.questionId}
              onClick={() => setQuestion(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <p>
          {Object.keys(answers).length} of {attempt.questions.length} answered
        </p>
        <p className="field-help">
          All questions have one correct answer. No negative marks. Saved answers can be changed
          before submission.
        </p>
        {!done && (
          <button
            className="text-button danger-text"
            disabled={busy}
            onClick={() => finish('ABANDON')}
          >
            Abandon this attempt
          </button>
        )}
      </aside>
    </div>
  );
}
