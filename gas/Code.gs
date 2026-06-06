/**
 * Code.gs
 * Web Appのエントリポイント。LIFFからの3アクションをさばく：
 *   - getCard     : 今日のカードを取得（なければ発行）
 *   - openSquare  : 注文したメニューでマスを開ける
 *   - getCoupons  : 自分のクーポン一覧を取る
 *
 * デプロイ：
 *   デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *   実行ユーザー：自分 / アクセス：全員
 */

function doGet() {
  return jsonResponse_({ ok: true, message: '居酒屋ビンゴ API 稼働中' });
}

function doPost(e) {
  try {
    const body = e.postData ? e.postData.contents : '';
    const json = JSON.parse(body);

    if (!json.action) {
      return jsonResponse_({ ok: false, error: 'actionが必要です' });
    }

    // 公開設定（メニュー一覧など）は認証不要
    if (json.action === 'menu') {
      return jsonResponse_({ ok: true, menu: getPublicMenu_() });
    }

    // 以降は本人確認が必要
    const idToken = json.idToken;
    if (!idToken) return jsonResponse_({ ok: false, error: 'idTokenが必要です' });
    const profile = verifyLineIdToken_(idToken);
    if (!profile) return jsonResponse_({ ok: false, error: '認証に失敗しました' });

    const userId = profile.userId;
    switch (json.action) {
      case 'getCard':
        return jsonResponse_({ ok: true, card: getOrCreateCard_(userId) });
      case 'openSquare': {
        const menuId = (json.data && json.data.menuId) || '';
        if (!menuId) return jsonResponse_({ ok: false, error: 'menuIdが必要です' });
        const r = openSquare_(userId, menuId);
        return jsonResponse_({ ok: true, result: r });
      }
      case 'getCoupons':
        return jsonResponse_({ ok: true, coupons: getCoupons_(userId) });
      default:
        return jsonResponse_({ ok: false, error: '未知のaction: ' + json.action });
    }
  } catch (err) {
    Logger.log(err.stack || err.message);
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * クライアントに渡すメニュー一覧（公開情報）。
 */
function getPublicMenu_() {
  const list = sheetToObjects_(getSheet_(SHEET_NAMES.MENU));
  // カテゴリでグルーピング
  const groups = {};
  list.forEach(function (m) {
    const cat = m.category || 'その他';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ id: m.id, name: m.name, emoji: m.emoji });
  });
  return groups;
}
