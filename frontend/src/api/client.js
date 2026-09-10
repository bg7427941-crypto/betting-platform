const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }

  return data;
}

export const api = {
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload, auth: false }),

  getWallet: () => request('/api/wallet'),
  deposit: (amountCents) => request('/api/wallet/deposit', { method: 'POST', body: { amount_cents: amountCents } }),
  withdraw: (amountCents) => request('/api/wallet/withdraw', { method: 'POST', body: { amount_cents: amountCents } }),
  walletHistory: () => request('/api/wallet/history'),

  listEvents: () => request('/api/sports/events'),
  getEvent: (id) => request(`/api/sports/events/${id}`),
  placeBet: (payload) => request('/api/sports/bets', { method: 'POST', body: payload }),

  playCasino: (payload) => request('/api/casino/play', { method: 'POST', body: payload }),
  casinoHistory: () => request('/api/casino/history'),

  adminSummary: () => request('/api/admin/summary'),
  adminListEvents: () => request('/api/sports/admin/events'),
  adminCreateEvent: (payload) => request('/api/sports/admin/events', { method: 'POST', body: payload }),
  adminSetOdds: (eventId, payload) =>
    request(`/api/sports/admin/events/${eventId}/odds`, { method: 'POST', body: payload }),
  adminCalculateOdds: (eventId, marginRate) =>
    request(`/api/sports/admin/events/${eventId}/odds/auto`, {
      method: 'POST',
      body: marginRate !== undefined ? { marginRate } : {},
    }),
  adminFinishEvent: (eventId, result) =>
    request(`/api/sports/admin/events/${eventId}/finish`, { method: 'POST', body: { result } }),

  adminListTeams: (sport) => request(`/api/admin/teams${sport ? `?sport=${sport}` : ''}`),
  adminCreateTeam: (payload) => request('/api/admin/teams', { method: 'POST', body: payload }),
  adminUpdateTeam: (id, payload) => request(`/api/admin/teams/${id}`, { method: 'PATCH', body: payload }),
};

export { getToken, API_URL };
