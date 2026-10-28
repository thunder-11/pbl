import React, { useState } from 'react';
import { useAuth, useData } from './context';
import { post } from './api';
import { PageHeading, ErrorBox, Badge, Empty } from './components';
export default function CurriculumEditor() {
  const { user } = useAuth(),
    { nodes, refresh } = useData(),
    [selected, setSelected] = useState(null),
    [form, setForm] = useState(null),
    [error, setError] = useState(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const start = (kind) => {
    const parent = nodes.find(
      (n) => n.kind === (kind === 'UNIT' ? 'SUBJECT' : 'UNIT') && n.status === 'PUBLISHED',
    );
    setSelected(null);
    setForm({
      kind,
      key: '',
      title: '',
      parentId: parent?.id || '',
      sortOrder: 1,
      syllabusLabel: 'Faculty-authored supplementary mapping',
      courseCode: null,
      status: 'DRAFT',
    });
    setError(null);
  };
  const edit = (node) => {
    setSelected(node);
    setForm(
      Object.fromEntries(
        [
          'kind',
          'key',
          'title',
          'parentId',
          'sortOrder',
          'syllabusLabel',
          'courseCode',
          'status',
        ].map((k) => [k, node[k]]),
      ),
    );
    setError(null);
    setConfirm(false);
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/curriculum', {
        operation: selected ? 'UPDATE' : 'CREATE',
        ...(selected ? { id: selected.id, recordVersion: selected.recordVersion } : {}),
        node: form,
      });
      setNotice('Curriculum mapping saved.');
      setForm(null);
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const archive = async () => {
    setBusy(true);
    try {
      await post('/curriculum', {
        operation: 'ARCHIVE',
        id: selected.id,
        recordVersion: selected.recordVersion,
      });
      setForm(null);
      setSelected(null);
      setConfirm(false);
      setNotice('Branch archived. Historical attempts are retained.');
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const editable = nodes.filter((n) => ['SUBJECT', 'UNIT', 'TOPIC'].includes(n.kind));
  return (
    <>
      <PageHeading
        title="Curriculum mappings"
        description="Preserve the official course identity.Add or revise teaching topics within your assigned branch."
        action={
          <div className="button-row">
            <button className="button secondary" onClick={() => start('UNIT')}>
              Add unit
            </button>
            <button className="button primary" onClick={() => start('TOPIC')}>
              Add topic
            </button>
          </div>
        }
      />
      <ErrorBox error={error} />
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {form && (
        <form className="authoring-form" onSubmit={save}>
          <div className="section-heading">
            <h2>{selected ? 'Edit mapping' : 'New mapping'}</h2>
            <button type="button" className="text-button" onClick={() => setForm(null)}>
              Close
            </button>
          </div>
          <div className="two-column">
            <label>
              Title
              <input
                required
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              Stable key
              <input
                required
                pattern="[a-z0-9-]+"
                disabled={Boolean(selected)}
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
            </label>
            <label>
              Parent
              <select
                required
                disabled={Boolean(selected)}
                value={form.parentId || ''}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              >
                <option value="">Select parent</option>
                {nodes
                  .filter(
                    (n) =>
                      n.kind === { SUBJECT: 'SEMESTER', UNIT: 'SUBJECT', TOPIC: 'UNIT' }[form.kind],
                  )
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Display order
              <input
                type="number"
                min={0}
                max={999}
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </label>
            <label>
              Source / syllabus mapping
              <input
                required
                maxLength={120}
                value={form.syllabusLabel}
                onChange={(e) => setForm({ ...form, syllabusLabel: e.target.value })}
              />
            </label>
            <label>
              Publication
              <select
                value={form.status}
                disabled={selected?.status === 'ARCHIVED'}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>DRAFT</option>
                <option>PUBLISHED</option>
                {selected?.status === 'ARCHIVED' && <option>ARCHIVED</option>}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button className="button primary" disabled={busy || selected?.status === 'ARCHIVED'}>
              Save mapping
            </button>
            {selected &&
              selected.status !== 'ARCHIVED' &&
              (user.role === 'ADMIN' || selected.kind !== 'SUBJECT') && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => setConfirm(true)}
                >
                  Archive branch
                </button>
              )}
          </div>
          {confirm && (
            <div className="inline-confirm">
              Archive this branch and its descendants? They will be unavailable for new activity.
              <button
                type="button"
                className="text-button danger-text"
                disabled={busy}
                onClick={archive}
              >
                Confirm archive
              </button>
              <button type="button" className="text-button" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          )}
        </form>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mapping</th>
              <th>Level</th>
              <th>Source</th>
              <th>Publication</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {editable.map((n) => (
              <tr key={n.id}>
                <td>
                  <strong>{n.title}</strong>
                  <span className="table-subline">
                    {nodes.find((p) => p.id === n.parentId)?.title}
                  </span>
                </td>
                <td>{n.kind.toLowerCase()}</td>
                <td>{n.syllabusLabel}</td>
                <td>
                  <Badge>{n.status.toLowerCase()}</Badge>
                </td>
                <td>
                  <button className="text-button" onClick={() => edit(n)}>
                    Edit mapping
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!editable.length && <Empty>No curriculum branches are assigned to this account.</Empty>}
    </>
  );
}
