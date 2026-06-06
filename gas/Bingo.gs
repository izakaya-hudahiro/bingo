/**
 * Bingo.gs
 * ビンゴカードの生成・取得・開封・ライン判定・特典発行のコアロジック。
 *
 * カード状態は cards シートに1行=1カードで保存する。
 *   layout_json : 25マスのメニューID配列（中央は "FREE"）
 *   opened_json : 開封済みindexの配列（中央FREEは初期から開いた扱い）
 */

/**
 * カードを取得する。なければ新規発行する。
 * 期限切れなら新しいカードに張り替える（同じuser_idで上書き）。
 */
function getOrCreateCard_(userId) {
  const sh = getSheet_(SHEET_NAMES.CARDS);
  const rows = sheetToObjects_(sh);
  const idx = rows.findIndex(function (r) { return r.user_id === userId; });

  const now = new Date();
  if (idx >= 0) {
    const card = rows[idx];
    const exp = new Date(card.expires_at);
    if (exp > now) {
      return decorateCard_(card);
    }
    // 期限切れ → 同じ行を上書き
    const fresh = newCardObject_(userId);
    writeCardRow_(sh, idx + 2, fresh);
    return decorateCard_(fresh);
  }

  // 新規発行
  const fresh = newCardObject_(userId);
  appendCardRow_(sh, fresh);
  return decorateCard_(fresh);
}

/**
 * カードオブジェクトに、メニュー詳細とライン判定の補助情報を付けて返す。
 * （クライアントはこれをそのまま受け取って描画する）
 */
function decorateCard_(card) {
  const layout = JSON.parse(card.layout_json);
  const opened = JSON.parse(card.opened_json);
  const menuById = buildMenuMap_();

  const squares = layout.map(function (menuId, i) {
    if (menuId === 'FREE') {
      return { index: i, menuId: 'FREE', name: 'FREE', emoji: '⭐', category: '', opened: true };
    }
    const m = menuById[menuId] || { name: menuId, emoji: '❔', category: '' };
    return {
      index: i,
      menuId: menuId,
      name: m.name,
      emoji: m.emoji,
      category: m.category,
      opened: opened.indexOf(i) >= 0
    };
  });

  const linesAchieved = Number(card.achieved_lines) || 0;
  const reachInfo = computeReachInfo_(layout, opened);

  return {
    cardId: card.card_id,
    expiresAt: card.expires_at,
    squares: squares,
    achievedLines: linesAchieved,
    reach: reachInfo.reachLines,           // あと1マスで揃うライン数
    nextRewardLines: nextRewardThreshold_(linesAchieved)
  };
}

function newCardObject_(userId) {
  const menus = sheetToObjects_(getSheet_(SHEET_NAMES.MENU));
  if (menus.length < 24) {
    throw new Error('メニューが24品以上必要です（現在: ' + menus.length + '品）');
  }
  // ユーザーIDと日付をシードにして「同じ日の同じ人」は同じ配置になるようにする
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const rng = seedRng_(userId + '|' + today);
  const picked = shuffleSeeded_(menus, rng).slice(0, 24).map(function (m) { return m.id; });

  // 24品を中央FREEを挟んだ25マスに配置
  const layout = picked.slice(0, BINGO_CONFIG.FREE_INDEX)
    .concat(['FREE'])
    .concat(picked.slice(BINGO_CONFIG.FREE_INDEX));

  const now = new Date();
  const expires = new Date(now.getTime() + BINGO_CONFIG.CARD_TTL_HOURS * 3600 * 1000);

  return {
    user_id: userId,
    card_id: shortId_('C'),
    created_at: nowString_(),
    expires_at: Utilities.formatDate(expires, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'),
    layout_json: JSON.stringify(layout),
    opened_json: JSON.stringify([BINGO_CONFIG.FREE_INDEX]), // 中央FREEは初期から開いてる
    achieved_lines: 0,
    updated_at: nowString_()
  };
}

function appendCardRow_(sh, card) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) { return card[h] !== undefined ? card[h] : ''; });
  sh.appendRow(row);
}

function writeCardRow_(sh, rowNum, card) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) { return card[h] !== undefined ? card[h] : ''; });
  sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
}

function buildMenuMap_() {
  const list = sheetToObjects_(getSheet_(SHEET_NAMES.MENU));
  const map = {};
  list.forEach(function (m) { map[m.id] = m; });
  return map;
}

/**
 * マスを開封する。
 * 戻り値： 更新後のカード + 今回新規発行されたクーポン一覧
 */
function openSquare_(userId, menuId) {
  const sh = getSheet_(SHEET_NAMES.CARDS);
  const rows = sheetToObjects_(sh);
  const idx = rows.findIndex(function (r) { return r.user_id === userId; });
  if (idx < 0) throw new Error('カードがまだありません。先にカードを発行してください。');

  const card = rows[idx];
  // 期限チェック
  if (new Date(card.expires_at) <= new Date()) {
    throw new Error('カードの有効期限が切れています。再読み込みで新しいカードを発行します。');
  }

  const layout = JSON.parse(card.layout_json);
  const opened = JSON.parse(card.opened_json);

  // どのマスがそのメニューに対応するか
  const squareIndex = layout.indexOf(menuId);
  if (squareIndex < 0) throw new Error('このメニューは今日のカードに含まれていません');
  if (opened.indexOf(squareIndex) >= 0) {
    return { alreadyOpened: true, card: decorateCard_(card), newCoupons: [] };
  }

  opened.push(squareIndex);
  const linesNow = countAchievedLines_(layout, opened);
  const previousLines = Number(card.achieved_lines) || 0;

  // 状態をシートに書き戻す
  card.opened_json = JSON.stringify(opened);
  card.achieved_lines = linesNow;
  card.updated_at = nowString_();
  writeCardRow_(sh, idx + 2, card);

  // ログ追記
  getSheet_(SHEET_NAMES.LOGS).appendRow([
    nowString_(), userId, card.card_id, menuId, squareIndex, linesNow
  ]);

  // 特典発行：今回の開封で新たに到達した報酬段階があれば
  const newCoupons = issueNewRewards_(userId, previousLines, linesNow);

  return {
    alreadyOpened: false,
    card: decorateCard_(card),
    newCoupons: newCoupons
  };
}

/**
 * 12通りのライン（横5 + 縦5 + 斜2）すべてについて、
 * 全マスが開封済みなら達成として数える。
 */
function countAchievedLines_(layout, opened) {
  const N = BINGO_CONFIG.SIZE;
  const openedSet = {};
  opened.forEach(function (i) { openedSet[i] = true; });

  const lines = allLineIndices_(N);
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].every(function (idx) { return openedSet[idx]; })) count++;
  }
  return count;
}

/**
 * リーチ情報：あと1マスで揃うラインの数
 */
function computeReachInfo_(layout, opened) {
  const N = BINGO_CONFIG.SIZE;
  const openedSet = {};
  opened.forEach(function (i) { openedSet[i] = true; });
  let reach = 0;
  const lines = allLineIndices_(N);
  lines.forEach(function (line) {
    const remaining = line.filter(function (idx) { return !openedSet[idx]; });
    if (remaining.length === 1) reach++;
  });
  return { reachLines: reach };
}

function allLineIndices_(N) {
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
  const d1 = []; const d2 = [];
  for (let i = 0; i < N; i++) {
    d1.push(i * N + i);
    d2.push(i * N + (N - 1 - i));
  }
  lines.push(d1); lines.push(d2);
  return lines;
}

/**
 * 次に到達できる報酬段階のライン数を返す（達成済みなら次の段階）。
 * 全部達成済みなら null。
 */
function nextRewardThreshold_(linesAchieved) {
  for (let i = 0; i < REWARDS.length; i++) {
    if (REWARDS[i].lines > linesAchieved) return REWARDS[i].lines;
  }
  return null;
}

/**
 * 今回の開封で「previousLines未満→linesNow以上」になった報酬を発行する。
 */
function issueNewRewards_(userId, previousLines, linesNow) {
  const earned = REWARDS.filter(function (r) {
    return r.lines > previousLines && r.lines <= linesNow;
  });
  if (earned.length === 0) return [];

  const sh = getSheet_(SHEET_NAMES.COUPONS);
  const created = [];
  earned.forEach(function (r) {
    const coupon = {
      coupon_id: shortId_('K'),
      user_id: userId,
      tier: r.tier,
      label: r.label,
      benefit: r.benefit,
      created_at: nowString_(),
      redeemed_at: '',
      status: 'issued'
    };
    sh.appendRow([
      coupon.coupon_id, coupon.user_id, coupon.tier, coupon.label, coupon.benefit,
      coupon.created_at, coupon.redeemed_at, coupon.status
    ]);
    created.push(coupon);
  });

  // 可能ならLINE pushで通知（access token未設定なら静かにスキップ）
  pushCouponNotification_(userId, created);
  return created;
}

/**
 * 利用者のクーポン一覧を返す（新しい順）。
 */
function getCoupons_(userId) {
  const list = sheetToObjects_(getSheet_(SHEET_NAMES.COUPONS))
    .filter(function (c) { return c.user_id === userId; });
  list.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return list;
}
