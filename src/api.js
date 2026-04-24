const TOKEN_KEY = "myday_token";

export const getToken  = ()    => localStorage.getItem(TOKEN_KEY);
export const setToken  = (t)   => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = ()   => localStorage.removeItem(TOKEN_KEY);

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}

export const api = {
  auth: {
    register: (username, password) =>
      apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
    login: (username, password) =>
      apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    me: () => apiFetch("/api/auth/me"),
  },
  todos: {
    getAll:   ()       => apiFetch("/api/todos"),
    create:   (todo)   => apiFetch("/api/todos",        { method: "POST",   body: JSON.stringify(todo) }),
    update:   (id, t)  => apiFetch(`/api/todos/${id}`,  { method: "PUT",    body: JSON.stringify(t) }),
    delete:   (id)     => apiFetch(`/api/todos/${id}`,  { method: "DELETE" }),
  },
  finance: {
    getAll:  ()      => apiFetch("/api/finance"),
    create:  (item)  => apiFetch("/api/finance",       { method: "POST",   body: JSON.stringify(item) }),
    delete:  (id)    => apiFetch(`/api/finance/${id}`, { method: "DELETE" }),
  },
  events: {
    getAll:  ()       => apiFetch("/api/events"),
    create:  (ev)     => apiFetch("/api/events",        { method: "POST",   body: JSON.stringify(ev) }),
    update:  (id, ev) => apiFetch(`/api/events/${id}`,  { method: "PUT",    body: JSON.stringify(ev) }),
    delete:  (id)     => apiFetch(`/api/events/${id}`,  { method: "DELETE" }),
  },
};
