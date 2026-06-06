/**
 * Line.gs
 * LINE関連：IDトークン検証、クーポン発行時のpush通知。
 */

/**
 * LIFFから送られてくるIDトークンを検証して LINE userId を取り出す。
 * 失敗したら null。
 */
function verifyLineIdToken_(idToken) {
  const channelId = getProp_(PROP_KEYS.LIFF_CHANNEL_ID);
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('IDトークン検証失敗: ' + res.getContentText());
    return null;
  }
  const profile = JSON.parse(res.getContentText());
  if (!profile || !profile.sub) return null;
  return { userId: profile.sub, name: profile.name || '', picture: profile.picture || '' };
}

/**
 * クーポン発行時にLINEでpush通知する。
 * LINE_CHANNEL_ACCESS_TOKEN が未設定ならスキップ（エラーにしない）。
 */
function pushCouponNotification_(userId, coupons) {
  const token = getPropOptional_(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token || coupons.length === 0) return;

  const shopName = getPropOptional_(PROP_KEYS.SHOP_NAME) || 'お店';
  const lines = coupons.map(function (c) {
    return '🎉 ' + c.label + '\n→ ' + c.benefit + '\n[クーポンID: ' + c.coupon_id + ']';
  });
  const text = shopName + 'のビンゴで特典GET！\n\n' + lines.join('\n\n') +
    '\n\nスタッフにこの画面を見せてください。';

  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('LINE push失敗（無視して続行）: ' + e.message);
  }
}
