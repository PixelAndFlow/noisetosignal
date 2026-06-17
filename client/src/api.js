const API_BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }

  return data;
}

export const api = {
  getMe: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  getSubscriptions: () => request('/api/subscriptions'),
  syncSubscriptions: () => request('/api/subscriptions/sync', { method: 'POST' }),
  getVideos: (channelIds, days) => {
    const params = new URLSearchParams({
      channels: channelIds.join(','),
      days: String(days),
    });
    return request(`/api/videos?${params}`);
  },
  googleAuthUrl: () => '/api/auth/google',
};
