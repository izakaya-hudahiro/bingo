/**
 * 居酒屋ビンゴ LIFF クライアント
 *
 * 流れ：
 *   1) LIFFを初期化してIDトークンを取る（DEMO_MODE時はダミー応答）
 *   2) getCard でカード取得 → 5x5を描画
 *   3) マスをタップ → 確認モーダル → openSquare → 反映＆演出
 *   4) クーポンが発行されたらトースト＆一覧更新
 */

const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

let idToken = null;
let currentCard = null;
let pendingSquare = null;

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  $(screenId).classList.add('visible');
}

function showError(msg) {
  $('errorText').textContent = msg;
  show('errorScreen');
}

async function init() {
  try {
    if (CFG.DEMO_MODE) {
      idToken = 'DEMO_TOKEN';
      await loadCard();
      return;
    }
    await liff.init({ liffId: CFG.LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    idToken = liff.getIDToken();
    await loadCard();
  } catch (e) {
    console.error(e);
    showError('LIFFの初期化に失敗しました: ' + (e.message || e));
  }
}

async function callApi(action, data) {
  if (CFG.DEMO_MODE) {
    return demoApi(action, data);
  }
  const res = await fetch(CFG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // GASでpreflight回避
    body: JSON.stringify({ action, idToken, data })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json;
}

async function loadCard() {
  const { card } = await callApi('getCard');
  currentCard = card;
  renderCard(card);
  await refreshCoupons();
  show('boardScreen');
}

function renderCard(card) {
  $('linesNum').textContent = card.achievedLines;
  $('reachNum').textContent = card.reach;
  $('nextNum').textContent = card.nextRewardLines || '🏆';

  if (card.achievedLines >= 12) {
    $('hintText').textContent = '🎊 フルビンゴ達成！おめでとうございます！';
  } else if (card.reach > 0) {
    $('hintText').textContent = `あと1マスで ${card.reach}本のラインが揃います！`;
  } else if (card.achievedLines > 0) {
    $('hintText').textContent = `${card.achievedLines}ライン達成中！次の特典まで頑張ろう`;
  } else {
    $('hintText').textContent = '頼んだメニューをタップしてマスを開けよう！';
  }

  const grid = $('bingoGrid');
  grid.innerHTML = '';
  const reachSquares = computeReachSquares(card);
  card.squares.forEach(sq => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (sq.menuId === 'FREE') cell.classList.add('free');
    if (sq.opened) cell.classList.add('opened');
    if (!sq.opened && reachSquares.has(sq.index)) cell.classList.add('reach');
    cell.innerHTML = `
      <div class="cell-emoji">${escapeHtml(sq.emoji || '🍽')}</div>
      <div class="cell-name">${escapeHtml(sq.name)}</div>
    `;
    if (!sq.opened && sq.menuId !== 'FREE') {
      cell.addEventListener('click', () => askConfirm(sq));
    }
    grid.appendChild(cell);
  });
}

/**
 * 「あと1マスで揃うライン」に含まれている未開封マスのindexを集める
 * （リーチ点滅させるため）
 */
function computeReachSquares(card) {
  const N = 5;
  const openedIdx = new Set(card.squares.filter(s => s.opened).map(s => s.index));
  const lines = allLines(N);
  const reach = new Set();
  lines.forEach(line => {
    const closed = line.filter(i => !openedIdx.has(i));
    if (closed.length === 1) reach.add(closed[0]);
  });
  return reach;
}

function allLines(N) {
  const lines = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) row.push(r * N + c);
    lines.push(row);
  }
  for (let c = 0; c < N; c++) {
    const col = [];
    for (let r = 0; r < N; r++) col.push(r * N + c);
    lines.push(col);
  }
  const d1 = [], d2 = [];
  for (let i = 0; i < N; i++) {
    d1.push(i * N + i);
    d2.push(i * N + (N - 1 - i));
  }
  lines.push(d1); lines.push(d2);
  return lines;
}

function askConfirm(square) {
  pendingSquare = square;
  $('confirmEmoji').textContent = square.emoji || '🍽';
  $('confirmName').textContent = square.name;
  $('confirmModal').classList.add('visible');
}

$('cancelBtn').addEventListener('click', () => {
  pendingSquare = null;
  $('confirmModal').classList.remove('visible');
});

$('confirmBtn').addEventListener('click', async () => {
  const sq = pendingSquare;
  $('confirmModal').classList.remove('visible');
  if (!sq) return;
  try {
    const { result } = await callApi('openSquare', { menuId: sq.menuId });
    currentCard = result.card;
    renderCard(result.card);
    if (result.newCoupons && result.newCoupons.length > 0) {
      celebrateCoupons(result.newCoupons);
      await refreshCoupons();
    }
  } catch (e) {
    alert('開けられませんでした: ' + e.message);
  }
});

function celebrateCoupons(coupons) {
  const head = coupons.length === 1 && coupons[0].tier === 'gold'
    ? '🎊 BINGO! 🎊'
    : '🎉 ライン達成！';
  const lines = coupons.map(c => `${c.label}\n→ ${c.benefit}`).join('\n\n');
  showToast(`${head}\n\n${lines}`);
}

function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('show');
  void t.offsetWidth; // reflow to restart animation
  t.classList.add('show');
}

async function refreshCoupons() {
  const { coupons } = await callApi('getCoupons');
  const list = $('couponsList');
  if (!coupons || coupons.length === 0) {
    list.innerHTML = '<p class="muted small">まだクーポンはありません。料理を頼んでマスを開けよう！</p>';
    return;
  }
  list.innerHTML = '';
  coupons.forEach(c => {
    const el = document.createElement('div');
    el.className = `coupon tier-${c.tier}` + (c.status === 'redeemed' ? ' redeemed' : '');
    el.innerHTML = `
      <div class="coupon-label">${escapeHtml(c.label)}</div>
      <div class="coupon-benefit">${escapeHtml(c.benefit)}</div>
      <div class="coupon-id">ID: ${escapeHtml(c.coupon_id)} ${c.status === 'redeemed' ? '【使用済み】' : ''}</div>
    `;
    list.appendChild(el);
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

/* ---------------- DEMO MODE（LIFF/GAS不要でローカル確認） ---------------- */
const DEMO_STATE = {
  menu: [
    ['m01','枝豆','お通し','🫛'], ['m02','冷やしトマト','お通し','🍅'],
    ['m03','本日の刺身盛り','刺身','🐟'], ['m04','マグロ赤身','刺身','🍣'],
    ['m05','サーモンカルパッチョ','刺身','🐠'],
    ['m06','鶏の唐揚げ','揚げ物','🍗'], ['m07','フライドポテト','揚げ物','🍟'],
    ['m08','海老天ぷら','揚げ物','🍤'],
    ['m09','焼き鳥盛り合わせ','焼き物','🍢'], ['m10','砂肝串','焼き物','🍡'],
    ['m11','銀ダラ西京焼き','焼き物','🐟'],
    ['m12','玉子焼き','一品','🍳'], ['m13','もつ煮込み','一品','🍲'],
    ['m14','だし巻き玉子','一品','🥚'], ['m15','冷奴','一品','⬜'],
    ['m16','シーザーサラダ','サラダ','🥗'], ['m17','海藻サラダ','サラダ','🥬'],
    ['m18','生ビール','ドリンク','🍺'], ['m19','ハイボール','ドリンク','🥃'],
    ['m20','日本酒（冷）','ドリンク','🍶'], ['m21','梅サワー','ドリンク','🍹'],
    ['m22','お茶漬け','〆','🍚'], ['m23','〆のラーメン','〆','🍜'],
    ['m24','デザート盛り合わせ','デザート','🍨']
  ].map(([id,name,category,emoji]) => ({id,name,category,emoji})),
  card: null,
  coupons: []
};
const REWARDS = [
  { lines: 1,  tier: 'bronze', label: '🥉 1ライン達成', benefit: '生ビール or ソフトドリンク1杯無料' },
  { lines: 2,  tier: 'silver', label: '🥈 2ライン達成', benefit: '本日のデザート1品サービス' },
  { lines: 12, tier: 'gold',   label: '🥇 フルビンゴ',  benefit: '〆メニュー1人前無料' }
];

function demoApi(action, data) {
  if (action === 'getCard') return { ok: true, card: demoGetCard() };
  if (action === 'openSquare') return { ok: true, result: demoOpen(data.menuId) };
  if (action === 'getCoupons') return { ok: true, coupons: DEMO_STATE.coupons.slice().reverse() };
  return { ok: false, error: 'unknown action' };
}

function demoGetCard() {
  if (!DEMO_STATE.card) {
    const shuffled = DEMO_STATE.menu.slice().sort(() => Math.random() - 0.5).slice(0, 24);
    const layout = shuffled.slice(0, 12).concat([{id:'FREE',name:'FREE',emoji:'⭐',category:''}]).concat(shuffled.slice(12));
    DEMO_STATE.card = { layout, opened: new Set([12]), achievedLines: 0 };
  }
  return demoDecorate();
}

function demoDecorate() {
  const c = DEMO_STATE.card;
  const squares = c.layout.map((m, i) => ({
    index: i, menuId: m.id, name: m.name, emoji: m.emoji, category: m.category,
    opened: c.opened.has(i)
  }));
  const reach = computeReach(c);
  return {
    cardId: 'DEMO', expiresAt: '', squares,
    achievedLines: c.achievedLines, reach,
    nextRewardLines: nextThreshold(c.achievedLines)
  };
}

function demoOpen(menuId) {
  const c = DEMO_STATE.card;
  const idx = c.layout.findIndex(m => m.id === menuId);
  if (idx < 0) throw new Error('カードに含まれていません');
  if (c.opened.has(idx)) return { alreadyOpened: true, card: demoDecorate(), newCoupons: [] };
  c.opened.add(idx);
  const prev = c.achievedLines;
  c.achievedLines = countLines(c);
  const earned = REWARDS.filter(r => r.lines > prev && r.lines <= c.achievedLines);
  earned.forEach(r => DEMO_STATE.coupons.push({
    coupon_id: 'K' + Math.random().toString(36).slice(2, 10).toUpperCase(),
    user_id: 'demo', tier: r.tier, label: r.label, benefit: r.benefit,
    created_at: new Date().toISOString(), redeemed_at: '', status: 'issued'
  }));
  return { alreadyOpened: false, card: demoDecorate(), newCoupons: earned.map(r => ({
    coupon_id: '', tier: r.tier, label: r.label, benefit: r.benefit
  })) };
}

function countLines(c) {
  return allLines(5).filter(line => line.every(i => c.opened.has(i))).length;
}
function computeReach(c) {
  return allLines(5).filter(line => line.filter(i => !c.opened.has(i)).length === 1).length;
}
function nextThreshold(linesAchieved) {
  for (const r of REWARDS) if (r.lines > linesAchieved) return r.lines;
  return null;
}

document.addEventListener('DOMContentLoaded', init);
