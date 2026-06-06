/**
 * Setup.gs
 * 初回セットアップ用：スプレッドシートに必要なシートを作る。
 *
 * 使い方：
 *   1) Configの setupProperties() を実行 → スクリプトプロパティに SHEET_ID を設定
 *   2) この setupSheets() を実行 → menu / cards / coupons / logs シートを作成
 *   3) seedSampleMenu() を実行 → サンプルメニュー24品を投入（任意）
 */

function setupSheets() {
  const ss = getSpreadsheet_();

  ensureSheet_(ss, SHEET_NAMES.MENU, [
    'id', 'name', 'category', 'emoji'
  ]);
  ensureSheet_(ss, SHEET_NAMES.CARDS, [
    'user_id', 'card_id', 'created_at', 'expires_at',
    'layout_json',     // 25マスのメニューID配列（FREEは "FREE"）
    'opened_json',     // 開封済みindex配列
    'achieved_lines',  // 達成済みライン数
    'updated_at'
  ]);
  ensureSheet_(ss, SHEET_NAMES.COUPONS, [
    'coupon_id', 'user_id', 'tier', 'label', 'benefit',
    'created_at', 'redeemed_at', 'status'  // status: issued / redeemed
  ]);
  ensureSheet_(ss, SHEET_NAMES.LOGS, [
    'timestamp', 'user_id', 'card_id', 'menu_id', 'square_index', 'lines_after'
  ]);

  console.log('シートを初期化しました: ' + Object.values(SHEET_NAMES).join(', '));
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

/**
 * サンプルメニュー24品を menu シートに投入する。
 * 5x5(中央FREE) = 24マス埋まる前提。
 */
function seedSampleMenu() {
  const sh = getSheet_(SHEET_NAMES.MENU);
  const sample = [
    ['m01', '枝豆',                'お通し', '🫛'],
    ['m02', '冷やしトマト',        'お通し', '🍅'],
    ['m03', '本日の刺身盛り',      '刺身',   '🐟'],
    ['m04', 'マグロ赤身',          '刺身',   '🍣'],
    ['m05', 'サーモンカルパッチョ','刺身',   '🐠'],
    ['m06', '鶏の唐揚げ',          '揚げ物', '🍗'],
    ['m07', 'フライドポテト',      '揚げ物', '🍟'],
    ['m08', '海老天ぷら',          '揚げ物', '🍤'],
    ['m09', '焼き鳥盛り合わせ',    '焼き物', '🍢'],
    ['m10', '砂肝串',              '焼き物', '🍡'],
    ['m11', '銀ダラ西京焼き',      '焼き物', '🐟'],
    ['m12', '玉子焼き',            '一品',   '🍳'],
    ['m13', 'もつ煮込み',          '一品',   '🍲'],
    ['m14', 'だし巻き玉子',        '一品',   '🥚'],
    ['m15', '冷奴',                '一品',   '⬜'],
    ['m16', 'シーザーサラダ',      'サラダ', '🥗'],
    ['m17', '海藻サラダ',          'サラダ', '🥬'],
    ['m18', '生ビール',            'ドリンク','🍺'],
    ['m19', 'ハイボール',          'ドリンク','🥃'],
    ['m20', '日本酒（冷）',        'ドリンク','🍶'],
    ['m21', '梅サワー',            'ドリンク','🍹'],
    ['m22', 'お茶漬け',            '〆',     '🍚'],
    ['m23', '〆のラーメン',        '〆',     '🍜'],
    ['m24', 'デザート盛り合わせ',  'デザート','🍨']
  ];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  sh.getRange(2, 1, sample.length, 4).setValues(sample);
  console.log('サンプルメニュー ' + sample.length + ' 件を投入しました');
}
