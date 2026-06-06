/**
 * Config.gs
 * 居酒屋ビンゴ - 設定まわり
 *
 * スクリプトプロパティから値を読み出す薄いラッパーと、
 * 全体で使う定数（シート名・特典段階・カード仕様）をまとめる。
 */

// スクリプトプロパティのキー名（タイプミス防止のため定数化）
const PROP_KEYS = {
  SHEET_ID: 'SHEET_ID',                              // ビンゴ用スプレッドシートID
  LIFF_CHANNEL_ID: 'LIFF_CHANNEL_ID',                // IDトークン検証に使用
  LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN', // クーポンpush通知に使用（任意）
  SHOP_NAME: 'SHOP_NAME'                             // クーポン文面に入れる店名（任意）
};

// シート名（1スプレッドシート内に並べる）
const SHEET_NAMES = {
  MENU: 'menu',         // メニューマスタ（id, name, category, emoji）
  CARDS: 'cards',       // 各お客さんのビンゴカード状態
  COUPONS: 'coupons',   // 発行済みクーポン
  LOGS: 'logs'          // 開封履歴（デバッグ/分析用）
};

// ビンゴカード仕様
const BINGO_CONFIG = {
  SIZE: 5,                       // 5x5
  FREE_INDEX: 12,                // 中央マス（0始まりで12 = 真ん中）
  CARD_TTL_HOURS: 6              // カードの有効期限（来店1回分の想定）
};

// 特典段階（達成ライン数 → 特典）
// 1ライン・2ライン・フルビンゴの3段階
const REWARDS = [
  { lines: 1,  tier: 'bronze', label: '🥉 1ライン達成',  benefit: '生ビール or ソフトドリンク1杯無料' },
  { lines: 2,  tier: 'silver', label: '🥈 2ライン達成',  benefit: '本日のデザート1品サービス' },
  { lines: 12, tier: 'gold',   label: '🥇 フルビンゴ',   benefit: '〆メニュー（茶漬け/ラーメン等）1人前無料' }
];

/**
 * 必須プロパティを取得。未設定なら分かりやすいエラーを投げる。
 */
function getProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('スクリプトプロパティ ' + key + ' が未設定です');
  return v;
}

/**
 * 任意プロパティを取得。未設定なら空文字を返す。
 */
function getPropOptional_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/**
 * セットアップ用：プロパティのプレースホルダを一括登録する。
 * 一度だけ実行 → 「プロジェクトの設定」画面で各値を実値に書き換える。
 */
function setupProperties() {
  PropertiesService.getScriptProperties().setProperties({
    SHEET_ID: 'ここにビンゴ用スプレッドシートのIDを貼り付け',
    LIFF_CHANNEL_ID: 'ここにLIFFアプリのチャネルIDを貼り付け',
    LINE_CHANNEL_ACCESS_TOKEN: '（任意）ここにMessaging APIのチャネルアクセストークンを貼り付け',
    SHOP_NAME: '居酒屋（店名）'
  });
  console.log('プロパティのプレースホルダを登録しました。各値を実値に書き換えてください。');
}
