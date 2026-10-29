// «Ночной эфир»: условия ночи, задания зрителей, живой чат стрима, достижения

const R0 = (seed) => { let z = (seed >>> 0) || 7; return () => { z = (z * 1103515245 + 12345) >>> 0; return z / 4294967296; }; };

// Какая выдалась ночь. Выбирается по зерну вылазки, поэтому у всей команды одинаковая
export const NIGHTS = [
  { id: 'calm', name: 'Тихая ночь', text: 'Ничего особенного. Пока.', fog: 1, bat: 1, speed: 1, views: 1 },
  { id: 'storm', name: 'Гроза', text: 'Молнии освещают всё на секунду. Гром заглушает шаги — и её тоже.', fog: 0.9, bat: 1, speed: 1, views: 1.25, lightning: true, hear: 0.7 },
  { id: 'fog', name: 'Туман', text: 'Видно на пару шагов. Зато и она видит хуже.', fog: 1.8, bat: 1, speed: 0.92, views: 1.3 },
  { id: 'moon', name: 'Кровавая луна', text: 'Она быстрее и злее. Зрители это обожают.', fog: 1, bat: 1, speed: 1.15, views: 1.6, red: true },
  { id: 'cold', name: 'Мороз', text: 'Батарейки садятся вдвое быстрее.', fog: 1, bat: 1.9, speed: 1, views: 1.35 },
  { id: 'silence', name: 'Мёртвая тишина', text: 'Она слышит каждый шаг. Иди медленно.', fog: 1, bat: 1, speed: 1, views: 1.35, hear: 1.6 },
  { id: 'stream', name: 'Ночь рекордов', text: 'Зрителей вдвое больше обычного, донаты щедрее.', fog: 1, bat: 1, speed: 1.05, views: 1.5, donate: 2 }
];
export function pickNight(seed, episodes) {
  if (episodes < 1) return NIGHTS[0];
  const r = R0(seed ^ 0x9e37)(); return NIGHTS[Math.floor(r * NIGHTS.length)];
}

// Задания от зрителей: три на вылазку, награда деньгами и подписчиками
const TASKS = [
  { id: 'close', text: 'Снять её ближе пяти метров', cat: ['monster_close'], need: 1, money: 600 },
  { id: 'seen', text: 'Снять её три раза', cat: ['monster', 'monster_close'], need: 3, money: 500 },
  { id: 'video', text: 'Десять секунд видео, где она в кадре', cat: ['monster', 'monster_close'], video: true, need: 20, money: 900 },
  { id: 'crawl', text: 'Снять ползуна', cat: ['crawler'], need: 1, money: 600, needCrawl: true },
  { id: 'body', text: 'Снять висящий мешок', cat: ['body'], need: 1, money: 300 },
  { id: 'friend', text: 'Снять друга, которого схватили', cat: ['friend'], need: 1, money: 700, coop: true },
  { id: 'loot', text: 'Найти пять находок', loot: true, need: 5, money: 500 },
  { id: 'allloot', text: 'Собрать все находки', loot: true, need: 7, money: 900 },
  { id: 'cursed', text: 'Вынести проклятую находку', cursed: true, need: 1, money: 1200 },
  { id: 'fast', text: 'Вернуться к фургону за шесть минут с тремя находками', fast: 360, need: 1, money: 800 },
  { id: 'notes', text: 'Найти две записки', notes: true, need: 2, money: 400 },
  { id: 'flare', text: 'Остановить её сигнальной шашкой', flare: true, need: 1, money: 600, needFlare: true }
];
export function makeTasks(seed, ctx) {
  const R = R0(seed ^ 0x51ed);
  const pool = TASKS.filter((t) => (!t.coop || !ctx.solo) && (!t.needCrawl || ctx.crawlers) && (!t.needFlare || ctx.flares));
  const out = [];
  while (out.length < 3 && pool.length) { const i = Math.floor(R() * pool.length); const t = pool.splice(i, 1)[0]; if (t.id === 'allloot' && out.some((x) => x.id === 'loot')) continue; if (t.id === 'loot' && out.some((x) => x.id === 'allloot')) continue; out.push({ ...t, have: 0, done: false }); }
  return out;
}

// Живой чат во время записи
const NICK = ['gromila228', 'katya_kot', 'temnyi_les', 'pelmen', 'xX_sasha_Xx', 'nochnoy_dozor', 'zhenya', 'kotletka', 'lis_pod_kustom', 'maks', 'nechto', 'bagira', 'vitalya', 'krot', 'lunatik', 'sonya_ne_spit', 'dimon', 'babka_s_semkami', 'tihiy_uzhas', 'shkolnik_2011'];
const CHAT = {
  selfie_monster: ['ЗА ТОБОЙ!!!', 'ОБЕРНИСЬ', 'СЗАДИ СЗАДИ СЗАДИ', 'чат, вы это видите??', 'он не знает...'],
  selfie: ['привет!', 'покажи лицо ближе', 'ты бледный', 'а сзади что?', 'симпатичный', 'разверни камеру'],
  monster_close: ['БЕГИИИИ', 'ОНА ПРЯМО ТАМ', 'я закрыл глаза', 'НЕ ВЫКЛЮЧАЙ СВЕТ', 'мама...', 'это лучший стрим в моей жизни', 'ааааааааа', 'КАМЕРУ НЕ РОНЯЙ'],
  monster: ['там кто-то стоит', 'справа!!!', 'вы видели??', 'приблизь', 'она смотрит в камеру', 'чат, это не монтаж', 'у меня мурашки'],
  crawler: ['ОНО ПОЛЗЁТ', 'выключи фонарь!', 'ноги... где его ноги', 'фу фу фу'],
  friend: ['F', 'спасайте его!!', 'оператор снимает а не помогает 💀', 'подними друга!'],
  phantom: ['кто это был за спиной?', 'перемотайте', 'я видел лицо'],
  body: ['это мешок?', 'что внутри...', 'не трогай'],
  nothing: ['а где монстр', 'скучно', 'покажи что-нибудь', 'го в тот коридор', 'темно', 'кто тут с телефона', 'привет из Самары', 'лайк если страшно', 'сверните налево', 'это прямой эфир?']
};
const DONATE = ['на батарейки', 'покажи её ещё раз', 'иди в тот коридор', 'беги!!!', 'на новый фонарь', 'за смелость', 'спасибо за стрим', 'не умирай'];
export function chatLine(cat, R = Math.random) { const pool = CHAT[cat] || CHAT.nothing; return { who: NICK[Math.floor(R() * NICK.length)], text: pool[Math.floor(R() * pool.length)] }; }
export function donation(score, k = 1, R = Math.random) {
  const base = score > 2000 ? 120 : score > 800 ? 60 : 20;
  const sum = Math.round((base + R() * base * 2) * k / 10) * 10;
  return { who: NICK[Math.floor(R() * NICK.length)], sum, text: DONATE[Math.floor(R() * DONATE.length)] };
}

// Достижения: проверяются после каждой вылазки, за каждое — деньги
export const ACH = [
  { id: 'first', name: 'Первый выпуск', text: 'Вернуться с вылазки', money: 200, test: (s) => s.episodes >= 1 },
  { id: 'close', name: 'В лицо', text: 'Снять её ближе пяти метров', money: 400, test: (s, r) => r.close },
  { id: 'tasks3', name: 'Всё по заказу', text: 'Выполнить все три задания за вылазку', money: 1500, test: (s, r) => r.allTasks },
  { id: 'cursed', name: 'Проклятый трофей', text: 'Вынести проклятую находку', money: 1000, test: (s, r) => r.cursed },
  { id: 'stream', name: 'Звезда эфира', text: 'Собрать 5000 зрителей в прямом эфире', money: 1500, test: (s, r) => r.peak >= 5000 },
  { id: 'donor', name: 'Спонсоры', text: 'Получить 3000 ₽ донатов за вылазку', money: 1000, test: (s, r) => r.donated >= 3000 },
  { id: 'ep10', name: 'Регулярные выпуски', text: 'Десять выпусков', money: 1500, test: (s) => s.episodes >= 10 },
  { id: 'ep50', name: 'Это уже работа', text: 'Пятьдесят выпусков', money: 8000, test: (s) => s.episodes >= 50 },
  { id: 's10k', name: '10 тысяч', text: '10 000 подписчиков', money: 2000, test: (s) => s.subs >= 10000 },
  { id: 's100k', name: 'Серебряная кнопка', text: '100 000 подписчиков', money: 15000, test: (s) => s.subs >= 100000 },
  { id: 's1m', name: 'Золотая кнопка', text: 'Миллион подписчиков', money: 100000, test: (s) => s.subs >= 1000000 },
  { id: 'maps5', name: 'Турне', text: 'Открыть пять карт', money: 3000, test: (s, r) => r.mapsOpen >= 5 },
  { id: 'maps10', name: 'Все адреса', text: 'Открыть все десять карт', money: 20000, test: (s, r) => r.mapsOpen >= 10 },
  { id: 'nights', name: 'Любая погода', text: 'Пережить пять разных ночей', money: 2500, test: (s) => Object.keys(s.nights || {}).length >= 5 },
  { id: 'storm', name: 'Под грозой', text: 'Вернуться в грозу', money: 500, test: (s, r) => r.night === 'storm' && r.win },
  { id: 'moon', name: 'Кровавая луна', text: 'Вернуться в ночь кровавой луны', money: 800, test: (s, r) => r.night === 'moon' && r.win }
];
