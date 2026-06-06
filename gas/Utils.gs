/**
 * Utils.gs
 * スプレッドシートアクセスとよく使う小さなヘルパー。
 */

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getProp_(PROP_KEYS.SHEET_ID));
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('シートが見つかりません: ' + name);
  return sh;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowString_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function shortId_(prefix) {
  return (prefix || '') + Utilities.getUuid().slice(0, 8).toUpperCase();
}

/**
 * シート全体を「ヘッダ行をキーにしたオブジェクト配列」として返す。
 * 例： [{id:'m01', name:'枝豆', ...}, ...]
 */
function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

/**
 * シートのヘッダ行のindexマップを返す。
 * 例： {id:0, name:1, ...}
 */
function headerIndexMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function (h, i) { map[h] = i; });
  return map;
}

/**
 * 文字列からシード可能な擬似乱数（Mulberry32）を作る。
 * カードのマス配置を user_id + 日付 で再現可能にするために使用。
 */
function seedRng_(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 配列をシード乱数でシャッフル（Fisher-Yates）。元配列は壊さない。
 */
function shuffleSeeded_(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
