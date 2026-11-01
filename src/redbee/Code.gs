/**
 * レッドビー水槽 共有用 Apps Script
 * スプレッドシートの「data」シートに、水槽のデータを保存します。
 *   A1 = 版番号（保存のたびに1ずつ増える）
 *   B1 = データを何行に分けて保存したか
 *   A2〜 = データ本体（長いので4万文字ずつに分けて保存）
 */
const SHEET_NAME = 'data';
const CHUNK = 40000;

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function read_() {
  const sh = sheet_();
  const rev = Number(sh.getRange('A1').getValue() || 0);
  const n = Number(sh.getRange('B1').getValue() || 0);
  if (!n) return { rev: rev, state: null };
  const text = sh.getRange(2, 1, n, 1).getValues().map(function (r) { return r[0]; }).join('');
  return { rev: rev, state: JSON.parse(text) };
}

function write_(rev, state) {
  const sh = sheet_();
  const text = JSON.stringify(state);
  const parts = [];
  for (let i = 0; i < text.length; i += CHUNK) parts.push([text.slice(i, i + CHUNK)]);
  const col = sh.getRange('A2:A');
  col.clearContent();
  col.setNumberFormat('@'); // 文字のまま保存（数字や日付に変換されないように）
  sh.getRange(2, 1, parts.length, 1).setValues(parts);
  sh.getRange('A1').setValue(rev);
  sh.getRange('B1').setValue(parts.length);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 読み込み
function doGet(e) {
  return out_(read_());
}

// 保存（ほかの端末が先に保存していたら、保存せずに最新のデータを返す）
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const req = JSON.parse(e.postData.contents);
    const cur = read_();
    if (cur.state && (req.base || 0) !== cur.rev) {
      return out_({ ok: false, rev: cur.rev, state: cur.state });
    }
    const rev = cur.rev + 1;
    req.state.rev = rev;
    write_(rev, req.state);
    return out_({ ok: true, rev: rev });
  } finally {
    lock.releaseLock();
  }
}
