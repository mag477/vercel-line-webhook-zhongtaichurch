export const config = { runtime: 'edge' };

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const TZ = 'Asia/Taipei';

const VERSE_POOL = [
  { book: '創', chap: 1, verse: 1 }, { book: '出', chap: 14, verse: 14 },
  { book: '民', chap: 6, verse: 24 }, { book: '申', chap: 31, verse: 6 },
  { book: '詩', chap: 23, verse: 1 }, { book: '詩', chap: 27, verse: 1 },
  { book: '詩', chap: 121, verse: 1 }, { book: '箴', chap: 3, verse: 5 },
  { book: '賽', chap: 40, verse: 31 }, { book: '太', chap: 5, verse: 9 },
  { book: '太', chap: 11, verse: 28 }, { book: '約', chap: 3, verse: 16 },
  { book: '約', chap: 14, verse: 6 }, { book: '羅', chap: 8, verse: 28 },
  { book: '林前', chap: 13, verse: 13 }, { book: '腓', chap: 4, verse: 6 },
  { book: '腓', chap: 4, verse: 13 }, { book: '帖前', chap: 5, verse: 16 },
  { book: '彼前', chap: 5, verse: 7 }, { book: '啟', chap: 21, verse: 4 },
];

function todayKey() {
  const now = new Date();
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  return `${tzNow.getFullYear()}${String(tzNow.getMonth()+1).padStart(2,'0')}${String(tzNow.getDate()).padStart(2,'0')}`;
}
function hashMod(str, mod) { let h=0; for(let i=0;i<str.length;i++) h=((h<<5)-h+str.charCodeAt(i))|0; return Math.abs(h)%mod; }
function pickToday(){ return VERSE_POOL[ hashMod(todayKey(), VERSE_POOL.length) ]; }

async function fetchFHLVerse(book, chap, verse) {
  const url = 'https://bible.fhl.net/json/qb.php?q=' + encodeURIComponent(`${book}${chap}:${verse}`);
  try {
    const res = await fetch(url);
    const txt = await res.text();
    console.log('[FHL] status', res.status, 'len', txt.length);
    const data = JSON.parse(txt);
    const rec = data?.record?.[0];
    return `（${book}${chap}:${verse}）${(rec?.bible_text ?? '').toString().trim()}`;
  } catch (e) {
    console.error('[FHL] error', e);
    return '（暫時無法取得 FHL 經文）';
  }
}

async function replyMessage(replyToken, text) {
  const payload = { replyToken, messages: [{ type: 'text', text }] };
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LINE_TOKEN },
    body: JSON.stringify(payload),
  });
  const respText = await res.text();
  console.log('[LINE reply] status', res.status, respText);
  return res.ok;
}

async function pushMessage(userId, text) {
  const payload = { to: userId, messages: [{ type: 'text', text }] };
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + LINE_TOKEN },
    body: JSON.stringify(payload),
  });
  const respText = await res.text();
  console.log('[LINE push] status', res.status, respText);
  return res.ok;
}

export default async function handler(req, event) {
  if (req.method === 'GET') return new Response('OK', { status: 200 });

  console.log('--- incoming', req.method, 'tokenSet=', !!LINE_TOKEN);
  const ack = new Response('OK', { status: 200 });

  const work = (async () => {
    try {
      const bodyText = await req.text();
      console.log('[req body]', bodyText.slice(0, 200));
      const body = JSON.parse(bodyText || '{}');
      const events = body.events || [];
      console.log('[events length]', events.length);

      for (const ev of events) {
        if (ev.type !== 'message' || typeof ev.message?.text !== 'string') {
          console.log('[skip] type=', ev.type);
          continue;
        }
        const text = ev.message.text.trim();
        console.log('[incoming text]', text, 'userId=', ev.source?.userId);

        if (!/^(每日經文|今日經文|經文)$/.test(text)) {
          console.log('[skip] not match');
          continue;
        }

        const pick = pickToday();
        const verse = await fetchFHLVerse(pick.book, pick.chap, pick.verse);
        const msg = `📖 今日金句（${pick.book}${pick.chap}:${pick.verse}）\n${verse}\n來源：信望愛 FHL 查經平台`;

        // 先嘗試 Reply
        const ok = await replyMessage(ev.replyToken, msg);

        // 若 Reply 失敗（401/400/403），再「推播給同一位使用者」當備援
        if (!ok && ev.source?.userId) {
          console.log('[fallback] try push');
          await pushMessage(ev.source.userId, msg + '\n(Reply失敗，改用Push)');
        }
      }
    } catch (e) {
      console.error('[handler error]', e);
    }
  })();

  if (event?.waitUntil) event.waitUntil(work);
  return ack;
}
