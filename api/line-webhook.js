export const config = { runtime: 'edge' };

/** ====== 可調整區 ====== */
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN; // Vercel 環境變數
const TZ = 'Asia/Taipei';

// 今日固定金句池（先給一組，可再擴充）
const VERSE_POOL = [
  { book: '創', chap: 1, verse: 1 },
  { book: '出', chap: 14, verse: 14 },
  { book: '民', chap: 6, verse: 24 },
  { book: '申', chap: 31, verse: 6 },
  { book: '詩', chap: 23, verse: 1 },
  { book: '詩', chap: 27, verse: 1 },
  { book: '詩', chap: 121, verse: 1 },
  { book: '箴', chap: 3, verse: 5 },
  { book: '賽', chap: 40, verse: 31 },
  { book: '太', chap: 5, verse: 9 },
  { book: '太', chap: 11, verse: 28 },
  { book: '約', chap: 3, verse: 16 },
  { book: '約', chap: 14, verse: 6 },
  { book: '羅', chap: 8, verse: 28 },
  { book: '林前', chap: 13, verse: 13 },
  { book: '腓', chap: 4, verse: 6 },
  { book: '腓', chap: 4, verse: 13 },
  { book: '帖前', chap: 5, verse: 16 },
  { book: '彼前', chap: 5, verse: 7 },
  { book: '啟', chap: 21, verse: 4 },
];

function todayKey() {
  const now = new Date();
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const yyyy = tzNow.getFullYear();
  const mm = String(tzNow.getMonth() + 1).padStart(2, '0');
  const dd = String(tzNow.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}
function hashMod(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}
async function fetchFHLVerse(book, chap, verse) {
  try {
    const url = 'https://bible.fhl.net/json/qb.php?q=' + encodeURIComponent(`${book}${chap}:${verse}`);
    const res = await fetch(url);
    const data = await res.json();
    const rec = data && data.record && data.record[0];
    const vtext = rec && rec.bible_text ? String(rec.bible_text).trim() : '';
    return `（${book}${chap}:${verse}）${vtext}`;
  } catch {
    return '（暫時無法取得 FHL 經文）';
  }
}
async function replyMessage(replyToken, text) {
  const payload = { replyToken, messages: [{ type: 'text', text }] };
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LINE_TOKEN },
    body: JSON.stringify(payload),
  });
}
function pickToday() {
  const idx = hashMod(todayKey(), VERSE_POOL.length);
  return VERSE_POOL[idx];
}

export default async function handler(req, event) {
  if (req.method === 'GET') {
    return new Response('OK', { status: 200 });
  }
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  const ack = new Response('OK', { status: 200 });

  const work = (async () => {
    const body = await req.json().catch(() => ({}));
    const events = body.events || [];
    for (const ev of events) {
      try {
        if (ev.type === 'message' && ev.message && typeof ev.message.text === 'string') {
          const text = ev.message.text.trim();
          if (/^(每日經文|今日經文|經文)$/.test(text)) {
            const pick = pickToday();
            const verse = await fetchFHLVerse(pick.book, pick.chap, pick.verse);
            const msg = `📖 今日金句（${pick.book}${pick.chap}:${pick.verse}）\n${verse}\n來源：信望愛 FHL 查經平台`;
            await replyMessage(ev.replyToken, msg);
          }
        }
      } catch {/* 忽略單筆錯誤 */}
    }
  })();

  if (event && typeof event.waitUntil === 'function') event.waitUntil(work);
  return ack;
}
