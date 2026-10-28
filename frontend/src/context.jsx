import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post, setCredentials, restoreSession } from './api';
const AuthContext = createContext(null),
  DataContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export const useData = () => useContext(DataContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    restoreSession()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const ended = () => setUser(null);
    window.addEventListener('trace:session-ended', ended);
    return () => {
      active = false;
      window.removeEventListener('trace:session-ended', ended);
    };
  }, []);
  const login = async (body) => {
    const auth = await post('/auth/login', body);
    setCredentials(auth);
    setUser(auth.user);
    return auth.user;
  };
  const logout = async () => {
    try {
      await post('/auth/logout');
    } finally {
      setCredentials(null);
      setUser(null);
    }
  };
  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}
export function DataProvider({ children }) {
  const { user } = useAuth(),
    [nodes, setNodes] = useState([]),
    [dashboard, setDashboard] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [n, d] = await Promise.all([
        get('/curriculum', { pageSize: 100 }),
        user.role === 'STUDENT' ? get(`/students/${user.id}/dashboard`) : Promise.resolve(null),
      ]);
      setNodes(n);
      setDashboard(d);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [user.id, user.role]);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ancestry = (node) => {
    let values = [],
      n = typeof node === 'string' ? byId.get(node) : node;
    while (n) {
      values.unshift(n);
      n = byId.get(n.parentId);
    }
    return values;
  };
  const topics = nodes.filter((n) => n.kind === 'TOPIC'),
    subjects = nodes.filter((n) => n.kind === 'SUBJECT');
  return (
    <DataContext.Provider
      value={{ nodes, topics, subjects, byId, ancestry, dashboard, loading, error, refresh }}
    >
      {children}
    </DataContext.Provider>
  );
}
