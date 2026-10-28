import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useData } from './context';
import { get, post, newKey } from './api';
import { PageHeading, Panel, ErrorBox, Empty } from './components';
export default function ComparePage() {
  const { topics } = useData(),
    available = topics.filter((t) => ['Bubble Sort', 'Merge Sort'].includes(t.title)),
    [topicId, setTopicId] = useState(available[0]?.id),
    [arrangement, setArrangement] = useState('CUSTOM'),
    [size, setSize] = useState(16),
    [seed, setSeed] = useState(123),
    [input, setInput] = useState('3, 2, 1'),
    [comparison, setComparison] = useState(null),
    [counter, setCounter] = useState('comparisons'),
    [trend, setTrend] = useState([]),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const value =
        arrangement === 'CUSTOM'
          ? {
              input: input
                .split(/[,\s]+/)
                .filter(Boolean)
                .map(Number),
            }
          : { size: Number(size), ...(arrangement === 'RANDOM' ? { seed: Number(seed) } : {}) };
      setComparison(
        await post('/comparisons', { topicId, arrangement, ...value, idempotencyKey: newKey() }),
      );
      setTrend([]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const growth = async () => {
    setBusy(true);
    setError(null);
    try {
      const rows = [];
      for (const n of [8, 16, 32, 64, 128]) {
        const c = await post('/comparisons', {
          topicId,
          arrangement: arrangement === 'CUSTOM' ? 'REVERSE' : arrangement,
          size: n,
          ...(arrangement === 'RANDOM' ? { seed: Number(seed) } : {}),
          idempotencyKey: newKey(),
        });
        rows.push({ size: n, bubble: c.results[0][counter], merge: c.results[1][counter] });
      }
      setTrend(rows);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        title="Compare algorithms"
        description="The same input.Two algorithms.Count the work instead of timing the animation."
      />
      <div className="comparison-controls">
        <label>
          Topic
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Input arrangement
          <select value={arrangement} onChange={(e) => setArrangement(e.target.value)}>
            {['CUSTOM', 'SORTED', 'REVERSE', 'RANDOM', 'DUPLICATES'].map((v) => (
              <option key={v} value={v}>
                {v[0] + v.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        {arrangement === 'CUSTOM' ? (
          <label className="wide">
            Values
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-describedby="comparison-help"
            />
          </label>
        ) : (
          <label>
            Input size
            <input
              type="number"
              min={2}
              max={128}
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
          </label>
        )}
        {arrangement === 'RANDOM' && (
          <label>
            Random seed
            <input
              type="number"
              min={0}
              max={4294967295}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
        )}
        <button className="button primary" disabled={busy || !topicId} onClick={run}>
          {busy ? 'Comparing…' : 'Compare input'}
        </button>
      </div>
      <p className="field-help" id="comparison-help">
        2–128 integers from−999 to999. Both algorithms receive separate copies of exactly the same
        input.
      </p>
      <ErrorBox error={error} />
      {comparison ? (
        <>
          <div className="comparison-input">
            <span>Input</span>
            <code>[{comparison.input.join(', ')}]</code>
          </div>
          <div className="two-column">
            <Panel
              title="Counted operations"
              action={
                <select
                  aria-label="Operation counter"
                  value={counter}
                  onChange={(e) => {
                    setCounter(e.target.value);
                    setTrend([]);
                  }}
                >
                  {[
                    ['comparisons', 'Comparisons'],
                    ['swaps', 'Swaps'],
                    ['mainWrites', 'Main-array writes'],
                    ['auxiliaryWrites', 'Auxiliary writes'],
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              }
            >
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={comparison.results.map((r) => ({
                      name: r.algorithm === 'BUBBLE_SORT' ? 'Bubble Sort' : 'Merge Sort',
                      count: r[counter],
                    }))}
                    margin={{ top: 12, right: 16, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="#edf0f2" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} fontSize={12} />
                    <Tooltip cursor={{ fill: '#f4f6f8' }} />
                    <Bar
                      dataKey="count"
                      name="Operations"
                      fill="#1b6c80"
                      barSize={64}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="field-help">Operation counts;no wall-clock speed measured.</p>
            </Panel>
            <Panel title="Measurement rules">
              <dl className="measurement-rules">
                <div>
                  <dt>Comparisons</dt>
                  <dd>Adjacent values in Bubble;sorted heads in Merge.</dd>
                </div>
                <div>
                  <dt>Swaps</dt>
                  <dd>One per adjacent exchange;Merge has none.</dd>
                </div>
                <div>
                  <dt>Main writes</dt>
                  <dd>Two per swap;one per merged value copied back.</dd>
                </div>
                <div>
                  <dt>Auxiliary writes</dt>
                  <dd>Each value appended to Merge's temporary range.</dd>
                </div>
              </dl>
              <p className="field-help">
                Loop checks,rendering,array reads and scalar assignments are excluded.
              </p>
            </Panel>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Algorithm</th>
                  <th className="num">Comparisons</th>
                  <th className="num">Swaps</th>
                  <th className="num">Main writes</th>
                  <th className="num">Auxiliary writes</th>
                </tr>
              </thead>
              <tbody>
                {comparison.results.map((r) => (
                  <tr key={r.algorithm}>
                    <td>{r.algorithm === 'BUBBLE_SORT' ? 'Bubble Sort' : 'Merge Sort'}</td>
                    {['comparisons', 'swaps', 'mainWrites', 'auxiliaryWrites'].map((k) => (
                      <td key={k} className="num">
                        {r[k].toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-heading">
            <div>
              <h2>Growth across input sizes</h2>
              <p className="field-help">
                {arrangement === 'CUSTOM'
                  ? 'Reverse-order datasets are used for this growth series.'
                  : `${arrangement.toLowerCase()} datasets with the same generator configuration.`}{' '}
                Sizes8,16,32,64 and128.
              </p>
            </div>
            <button className="button secondary" disabled={busy} onClick={growth}>
              Compare growth series
            </button>
          </div>
          {trend.length > 0 && (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trend} margin={{ right: 20, left: 0, top: 20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#edf0f2" />
                  <XAxis dataKey="size" axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend iconType="plainline" />
                  <Line
                    dataKey="bubble"
                    name="Bubble Sort"
                    type="linear"
                    stroke="#1b6c80"
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="merge"
                    name="Merge Sort"
                    type="linear"
                    stroke="#848e94"
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="two-column complexity-notes">
            <div>
              <h3>Bubble Sort</h3>
              <p>Best Θ(n) with early exit;average/worst Θ(n²). Auxiliary space Θ(1).</p>
            </div>
            <div>
              <h3>Merge Sort</h3>
              <p>Time Θ(n log n);auxiliary space Θ(n),plus recursion stack Θ(log n).</p>
            </div>
          </div>
        </>
      ) : (
        <Empty>
          Choose an input and compare the two algorithms. The chart and counters will use real
          deterministic engine results.
        </Empty>
      )}
    </>
  );
}
