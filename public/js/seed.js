/* Демо-данные для офлайн-режима (когда сервер недоступен, напр. открытие через file://).
   Структура полей повторяет ответ REST API. */
window.SEED = {
  categories: [
    { id: 1, slug: 'games', title: 'Игры', icon: '🎮', type: 'game', position: 0, hidden: false },
    { id: 2, slug: 'subs', title: 'Подписки', icon: '💎', type: 'sub', position: 1, hidden: false },
    { id: 3, slug: 'codes', title: 'Коды пополнения', icon: '💳', type: 'code', position: 2, hidden: false },
  ],
  products: [
    { id:1, type:'game', categoryId:1, name:'EA Sports FC 26', emoji:'⚽', platform:'PS4/PS5', edition:'Standard', price:5995, oldPrice:null, inStock:true, popularity:98, isNew:false, isSale:false, isPreorder:false, isFeatured:true, description:'Новое поколение футбольного симулятора. HyperMotionV, 30+ лиг и LiveSeasons — рейтинги обновляются в реальном времени.', meta:{size:'45 ГБ',players:'1-22',rating:'3+'} },
    { id:2, type:'game', categoryId:1, name:'It Takes Two', emoji:'🤝', platform:'PS4/PS5', edition:'Standard', price:1995, oldPrice:3995, inStock:true, popularity:90, isSale:true, description:'Кооперативная игра года. Кода и Мэй спасают свои отношения, преодолевая приключения вдвоём.', meta:{size:'50 ГБ',players:'2 игрока',rating:'12+'} },
    { id:3, type:'game', categoryId:1, name:'A Way Out', emoji:'🚗', platform:'PS4', edition:'Standard', price:1295, oldPrice:2595, inStock:true, popularity:80, isSale:true, description:'Кооперативный побег из тюрьмы. Лео и Винсент — только вместе.', meta:{size:'23 ГБ',players:'2 игрока',rating:'18+'} },
    { id:4, type:'game', categoryId:1, name:'Red Dead Redemption 2', emoji:'🤠', platform:'PS4', edition:'Standard', price:2695, oldPrice:4995, inStock:true, popularity:95, isSale:true, description:'Эпический вестерн от Rockstar. Последние дни Дикого Запада в огромном открытом мире.', meta:{size:'107 ГБ',players:'1 игрок',rating:'18+'} },
    { id:5, type:'game', categoryId:1, name:'GTA V', emoji:'🌆', platform:'PS4/PS5', edition:'Premium', price:1495, oldPrice:2995, inStock:true, popularity:99, isSale:true, description:'Самая продаваемая игра всех времён. Лос-Сантос и огромный онлайн-мир.', meta:{size:'100 ГБ',players:'1-30',rating:'18+'} },
    { id:6, type:'game', categoryId:1, name:'EA Sports UFC 6', emoji:'🥊', platform:'PS5', edition:'Standard', price:11995, oldPrice:null, inStock:true, popularity:70, isNew:true, isFeatured:true, description:'Новое поколение UFC — реалистичные удары и актуальный ростер бойцов.', meta:{size:'55 ГБ',players:'1-2',rating:'16+'} },
    { id:7, type:'game', categoryId:1, name:'Gothic 1 Remake', emoji:'⚔️', platform:'PS5', edition:'Standard', price:7735, inStock:true, popularity:65, isNew:true, description:'Переосмысление культовой RPG 2001 года в современной графике.', meta:{size:'35 ГБ',players:'1 игрок',rating:'16+'} },
    { id:8, type:'game', categoryId:1, name:'Hazelight: Bundle', emoji:'🌟', platform:'PS4/PS5', edition:'2 игры', price:2495, oldPrice:5990, inStock:true, popularity:72, isNew:true, isSale:true, description:'It Takes Two и A Way Out в одном бандле от Josef Fares.', meta:{size:'73 ГБ',players:'2 игрока',rating:'12+'} },
    { id:9, type:'game', categoryId:1, name:'AC Black Flag Resynced', emoji:'🏴‍☠️', platform:'PS5', edition:'Standard', price:7735, inStock:false, popularity:60, isPreorder:true, description:'Полный ремейк лучшей части Assassin\u2019s Creed — пиратские моря и Эдвард Кенуэй.', meta:{size:'70 ГБ',players:'1 игрок',rating:'18+'} },
    { id:10, type:'game', categoryId:1, name:'Monster Hunter Wilds', emoji:'🐉', platform:'PS5', edition:'Standard', price:6495, inStock:false, popularity:75, isPreorder:true, description:'Живая экосистема и монстры, реагирующие на погоду.', meta:{size:'65 ГБ',players:'1-4',rating:'16+'} },
    { id:11, type:'sub', categoryId:2, name:'PS Plus Essential', emoji:'🟦', platform:'PlayStation', edition:'Essential', price:1200, inStock:true, popularity:88, isFeatured:true, description:'Базовая подписка PlayStation Plus — онлайн-игры и ежемесячные подарки.', meta:{periods:{1:1200,3:2990,12:8990},features:['Онлайн-мультиплеер','2 игры в месяц','Скидки магазина','Облако 100 ГБ']} },
    { id:12, type:'sub', categoryId:2, name:'PS Plus Extra', emoji:'🟧', platform:'PlayStation', edition:'Extra', price:1800, inStock:true, popularity:85, description:'Всё из Essential + каталог 400+ игр PS4 и PS5.', meta:{periods:{1:1800,3:4490,12:13490},features:['Всё из Essential','Каталог 400+ игр','Новинки каждый месяц','Скидки Extra']} },
    { id:13, type:'sub', categoryId:2, name:'PS Plus Deluxe', emoji:'⬛', platform:'PlayStation', edition:'Deluxe', price:2130, inStock:true, popularity:82, description:'Максимум — каталог, классика и облачный стриминг.', meta:{periods:{1:2130,3:5290,12:15990},features:['Всё из Extra','Классика PS1-PSP','Облачный стриминг','Пробные версии']} },
    { id:14, type:'sub', categoryId:2, name:'EA Play — 1 месяц', emoji:'🟪', platform:'EA', edition:'1 месяц', price:655, inStock:true, popularity:70, description:'Доступ к библиотеке EA на 1 месяц.', meta:{periods:{1:655},features:['100+ игр EA','Скидки 10%','Пробные версии']} },
    { id:15, type:'sub', categoryId:2, name:'Xbox Game Pass Ultimate', emoji:'🟩', platform:'Xbox', edition:'Ultimate', price:890, inStock:true, popularity:78, isNew:true, description:'Сотни игр, EA Play, облачный гейминг и Xbox Live Gold.', meta:{periods:{1:890},features:['300+ игр','EA Play включён','Cloud Gaming','Xbox Live Gold']} },
    { id:16, type:'code', categoryId:3, name:'PSN Пополнение 1000 ₺', emoji:'💳', platform:'PSN Турция', edition:'Номинал 1000 ₺', price:2790, inStock:true, popularity:86, isFeatured:true, description:'Код пополнения кошелька PSN (Турция) на 1000 турецких лир.' },
    { id:17, type:'code', categoryId:3, name:'PSN Пополнение 500 ₺', emoji:'💳', platform:'PSN Турция', edition:'Номинал 500 ₺', price:1450, inStock:true, popularity:80, description:'Код пополнения кошелька PSN Турция на 500 лир.' },
    { id:18, type:'code', categoryId:3, name:'PSN Пополнение 250 ₺', emoji:'💳', platform:'PSN Турция', edition:'Номинал 250 ₺', price:790, inStock:true, popularity:74, description:'Код пополнения кошелька PSN Турция на 250 лир.' },
    { id:19, type:'code', categoryId:3, name:'PSN Пополнение 100 ₺', emoji:'💳', platform:'PSN Турция', edition:'Номинал 100 ₺', price:350, inStock:true, popularity:66, isNew:true, description:'Код пополнения кошелька PSN Турция на 100 лир.' },
    { id:20, type:'code', categoryId:3, name:'Steam Кошелёк 1000 ₽', emoji:'🎟️', platform:'Steam', edition:'Номинал 1000 ₽', price:1090, oldPrice:1190, inStock:true, popularity:72, isSale:true, description:'Пополнение кошелька Steam на 1000 рублей.' },
  ],
  settings: { store: { name: 'Релок', tagline: 'PlayStation Турция', currency: '₽' } },
};

/* Локальный движок запросов (повторяет логику сервера для офлайн-режима) */
window.queryLocal = function (params) {
  let items = SEED.products.filter(p => !p.hidden);
  if (params.type) items = items.filter(p => p.type === params.type);
  if (params.category) items = items.filter(p => p.categoryId === +params.category);
  if (params.flag === 'new') items = items.filter(p => p.isNew);
  if (params.flag === 'sale') items = items.filter(p => p.isSale || p.oldPrice);
  if (params.flag === 'preorder') items = items.filter(p => p.isPreorder);
  if (params.flag === 'featured') items = items.filter(p => p.isFeatured);
  if (params.flag === 'instock') items = items.filter(p => p.inStock);
  const q = (params.q || '').trim().toLowerCase();
  if (q) items = items.filter(p => (p.name + ' ' + p.description).toLowerCase().includes(q));
  items = items.map(p => ({ ...p, sale: p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0 }));
  const sorters = {
    price_asc: (a, b) => a.price - b.price, price_desc: (a, b) => b.price - a.price,
    popular: (a, b) => b.popularity - a.popularity, new: (a, b) => b.id - a.id,
    name: (a, b) => a.name.localeCompare(b.name), position: (a, b) => a.id - b.id,
  };
  items.sort(sorters[params.sort] || sorters.position);
  const total = items.length;
  const limit = Math.min(+params.limit || 100, 200), page = Math.max(+params.page || 1, 1);
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
};
