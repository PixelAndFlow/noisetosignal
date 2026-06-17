const MOCK_CREATORS = [
  { channelId: 'UC_mock_mkbhd', channelName: 'MKBHD', channelAvatarUrl: 'https://ui-avatars.com/api/?name=MKBHD&background=ff4444&color=fff' },
  { channelId: 'UC_mock_veritasium', channelName: 'Veritasium', channelAvatarUrl: 'https://ui-avatars.com/api/?name=Veritasium&background=333&color=fff' },
  { channelId: 'UC_mock_fireship', channelName: 'Fireship', channelAvatarUrl: 'https://ui-avatars.com/api/?name=Fireship&background=orange&color=fff' },
  { channelId: 'UC_mock_kurzgesagt', channelName: 'Kurzgesagt', channelAvatarUrl: 'https://ui-avatars.com/api/?name=Kurzgesagt&background=0066cc&color=fff' },
  { channelId: 'UC_mock_mrmobile', channelName: 'MrMobile', channelAvatarUrl: 'https://ui-avatars.com/api/?name=MrMobile&background=222&color=fff' },
  { channelId: 'UC_mock_linustech', channelName: 'Linus Tech Tips', channelAvatarUrl: 'https://ui-avatars.com/api/?name=LTT&background=ff6600&color=fff' },
  { channelId: 'UC_mock_3blue1brown', channelName: '3Blue1Brown', channelAvatarUrl: 'https://ui-avatars.com/api/?name=3B1B&background=4488ff&color=fff' },
  { channelId: 'UC_mock_cody', channelName: 'Cody Seibert', channelAvatarUrl: 'https://ui-avatars.com/api/?name=Cody&background=663399&color=fff' },
  { channelId: 'UC_mock_traversy', channelName: 'Traversy Media', channelAvatarUrl: 'https://ui-avatars.com/api/?name=Traversy&background=0099cc&color=fff' },
  { channelId: 'UC_mock_theo', channelName: 'Theo - t3.gg', channelAvatarUrl: 'https://ui-avatars.com/api/?name=Theo&background=111&color=fff' },
];

const MOCK_VIDEOS = [
  { videoId: 'dQw4w9WgXcQ', title: 'Why your YouTube feed is broken (and how to fix it)', channelId: 'UC_mock_mkbhd', channelName: 'MKBHD', daysAgo: 1 },
  { videoId: 'jNQXAC9IVRw', title: 'The physics trick that fools everyone', channelId: 'UC_mock_veritasium', channelName: 'Veritasium', daysAgo: 2 },
  { videoId: 'kJQP7kiw5Fk', title: 'I built an anti-algorithm YouTube app in 100 seconds', channelId: 'UC_mock_fireship', channelName: 'Fireship', daysAgo: 0 },
  { videoId: 'L_LUpnjgPso', title: 'What happens if you subscribe to 500 channels?', channelId: 'UC_mock_kurzgesagt', channelName: 'Kurzgesagt', daysAgo: 3 },
  { videoId: '9bZkp7q19f0', title: 'Foldable phones in 2026 — honest review', channelId: 'UC_mock_mrmobile', channelName: 'MrMobile', daysAgo: 4 },
  { videoId: 'RgKAFK5djSk', title: 'We tested every laptop so you don\'t have to', channelId: 'UC_mock_linustech', channelName: 'Linus Tech Tips', daysAgo: 5 },
  { videoId: 'aircAruvnKk', title: 'Neural networks, visually explained', channelId: 'UC_mock_3blue1brown', channelName: '3Blue1Brown', daysAgo: 6 },
  { videoId: 'Oe421EPjeBE', title: 'Full stack dev roadmap 2026', channelId: 'UC_mock_cody', channelName: 'Cody Seibert', daysAgo: 2 },
  { videoId: 'UB1O30fR-EE', title: 'React crash course for beginners', channelId: 'UC_mock_traversy', channelName: 'Traversy Media', daysAgo: 8 },
  { videoId: 'SqcY0Gl9Psg', title: 'Stop using useEffect for everything', channelId: 'UC_mock_theo', channelName: 'Theo - t3.gg', daysAgo: 1 },
  { videoId: 'abc123demo01', title: 'iPhone 17 Pro — first look', channelId: 'UC_mock_mkbhd', channelName: 'MKBHD', daysAgo: 10 },
  { videoId: 'abc123demo02', title: 'The infinite paradox explained', channelId: 'UC_mock_veritasium', channelName: 'Veritasium', daysAgo: 15 },
  { videoId: 'abc123demo03', title: 'Supabase vs Firebase in 2026', channelId: 'UC_mock_fireship', channelName: 'Fireship', daysAgo: 20 },
  { videoId: 'abc123demo04', title: 'The immune system — a visual journey', channelId: 'UC_mock_kurzgesagt', channelName: 'Kurzgesagt', daysAgo: 25 },
  { videoId: 'abc123demo05', title: 'Best tech under $50', channelId: 'UC_mock_mrmobile', channelName: 'MrMobile', daysAgo: 30 },
];

export function getMockSubscriptions() {
  return MOCK_CREATORS.map((c) => ({ ...c }));
}

export function getMockVideos(channelIds, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const idSet = new Set(channelIds);

  return MOCK_VIDEOS.filter((v) => {
    if (!idSet.has(v.channelId)) return false;
    const published = Date.now() - v.daysAgo * 24 * 60 * 60 * 1000;
    return published >= cutoff;
  })
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      channelId: v.channelId,
      channelName: v.channelName,
      thumbnailUrl: `https://picsum.photos/seed/${v.videoId}/640/360`,
      publishedAt: new Date(Date.now() - v.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    }))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 100);
}

export const MOCK_USER = {
  googleId: 'dev-user-001',
  email: 'demo@noisetosignal.local',
  displayName: 'Demo User',
  avatarUrl: 'https://ui-avatars.com/api/?name=Demo+User&background=ff4444&color=fff',
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
};
