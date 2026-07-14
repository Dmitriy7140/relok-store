/**
 * Logovo · PlayStation Турция — генератор Google-опроса (v2).
 *
 * КАК ЗАПУСТИТЬ (2 минуты):
 * 1. Открой https://script.google.com → «Новый проект».
 * 2. Удали код-заглушку, вставь ЭТОТ файл целиком (он должен начинаться
 *    строкой `function buildSurvey() {`, без обёртки myFunction).
 * 3. Ctrl+S → сверху в списке функций выбери `buildSurvey` → ▶ «Выполнить».
 * 4. Разреши доступ к аккаунту (один раз).
 * 5. В «Журнал выполнения» появятся 2 ссылки:
 *    — editUrl : форма для редактирования и просмотра ответов (тебе)
 *    — liveUrl : публичная ссылка (её раздаёшь ЦА)
 *
 * Опрос разбит на 3 экрана с прогресс-баром. Все вопросы необязательные
 * (нет красной надписи «Обязательный вопрос»), e-mail не собирается.
 */
function buildSurvey() {
  const form = FormApp.create('Опрос игроков PlayStation — Logovo')
    .setDescription(
      '🎁 ПРОЙДИ ОПРОС — ПОЛУЧИ ПРОМОКОД!\n' +
      'После прохождения опроса мы отправим тебе случайный промокод на пополнение ' +
      'PlayStation Store или App Store. Займёт 2–3 минуты, ответы анонимны и помогают ' +
      'нам сделать сервис удобнее любого другого 💛'
    )
    .setConfirmationMessage(
      'Спасибо! 🎉 Твой промокод на пополнение PlayStation / App Store уже в пути — ' +
      'мы свяжемся с тобой в Telegram. Хорошей игры! 🎮'
    )
    .setProgressBar(true)     // прогресс между экранами
    .setCollectEmail(false)   // не требуем вход по e-mail
    .setAllowResponseEdits(false);

  /* ═══════════════ ЭКРАН 1 · Немного о тебе ═══════════════════════
     Базовый портрет аудитории — самые лёгкие вопросы в начале.       */
  form.addSectionHeaderItem()
    .setTitle('Немного о тебе')
    .setHelpText('Пара быстрых вопросов, чтобы лучше понять нашу аудиторию.');

  form.addMultipleChoiceItem().setTitle('Сколько тебе лет?').setRequired(false)
    .setChoiceValues(['До 14', '14–17', '18–24', '25–34', '35–44', '45+']);

  form.addMultipleChoiceItem().setTitle('Твой пол').setRequired(false)
    .setChoiceValues(['Мужской', 'Женский', 'Не хочу указывать']);

  form.addMultipleChoiceItem().setTitle('Чем ты обычно занимаешься?').setRequired(false)
    .setChoiceValues(['Учусь (школа / колледж / вуз)', 'Работаю', 'Учусь и работаю', 'Пока ни то, ни другое'])
    .showOtherOption(true);

  /* ═══════════════ ЭКРАН 2 · Как ты играешь и покупаешь ═══════════
     Платформы, формат покупок и бюджет — логично идут вместе.        */
  form.addPageBreakItem()
    .setTitle('Как ты играешь и покупаешь')
    .setHelpText('Расскажи про свои платформы и привычки в покупках игр.');

  form.addMultipleChoiceItem().setTitle('Как часто ты играешь?').setRequired(false)
    .setChoiceValues(['Каждый день', 'Несколько раз в неделю', 'Пару раз в месяц', 'Редко / по настроению']);

  form.addCheckboxItem().setTitle('На каких платформах ты играешь?').setRequired(false)
    .setChoiceValues([
      'PlayStation 5',
      'PlayStation 4',
      'Xbox',
      'PC',
      'Nintendo Switch',
      'Android',
      'iPhone (iOS)',
    ]).showOtherOption(true);

  form.addMultipleChoiceItem().setTitle('Ты чаще покупаешь игры или пользуешься подпиской?').setRequired(false)
    .setChoiceValues([
      'Покупаю игры по отдельности',
      'В основном подписка (PS Plus и т.п.)',
      'И то, и другое',
      'Играю только в бесплатное',
    ]);

  form.addMultipleChoiceItem().setTitle('Сколько в среднем ты тратишь на игры в месяц?').setRequired(false)
    .setChoiceValues(['0 ₽', 'до 1 000 ₽', '1 000–3 000 ₽', '3 000–6 000 ₽', '6 000–10 000 ₽', 'более 10 000 ₽']);

  form.addMultipleChoiceItem().setTitle('Кто чаще всего оплачивает игры и подписки?').setRequired(false)
    .setChoiceValues(['Плачу сам(а)', 'Родители / родственники', 'Совместно'])
    .showOtherOption(true);

  /* ═══════════════ ЭКРАН 3 · Опыт, площадки и обратная связь ══════
     Где покупают, что нравится/бесит, и оценка нашего магазина.      */
  form.addPageBreakItem()
    .setTitle('Твой опыт и обратная связь')
    .setHelpText('Самая важная часть — здесь твоё мнение помогает нам больше всего.');

  form.addCheckboxItem().setTitle('Где вы сейчас покупаете или покупали ранее игры и подписки?').setRequired(false)
    .setChoiceValues([
      'Официальный PlayStation Store',
      'Турецкий / зарубежный аккаунт PSN',
      'GGSEL',
      'Plati.market / Digiseller',
      'Steam',
      'Ozon',
      'Wildberries',
      'Яндекс Маркет',
      'Telegram-магазины / боты',
      'Avito / Юла',
      'У знакомых / перекупщиков',
      'Ещё не покупал(а)',
    ]).showOtherOption(true);

  form.addParagraphTextItem()
    .setTitle('Что вам НРАВИТСЯ в этих площадках?')
    .setHelpText('Опишите подробно, что удобно и что нравится: цены, скорость, сервис, интерфейс и т.д.')
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Что вам НЕ нравится в этих площадках? ⭐ (самый важный вопрос)')
    .setHelpText('Опишите максимально подробно все минусы: что неудобно, что раздражает, ' +
      'какие были проблемы, чего не хватает и что хотелось бы улучшить. Чем больше деталей — ' +
      'тем лучше мы сделаем сервис для тебя 🙏')
    .setRequired(false);

  form.addMultipleChoiceItem().setTitle('Что для тебя ГЛАВНОЕ при выборе магазина?').setRequired(false)
    .setChoiceValues(['Цена', 'Скорость выдачи', 'Надёжность и гарантии', 'Удобство оформления', 'Поддержка и общение'])
    .showOtherOption(true);

  form.addScaleItem().setTitle('Насколько ты доверяешь покупкам игр через Telegram-магазины?')
    .setBounds(1, 5).setLabels('Совсем не доверяю', 'Полностью доверяю').setRequired(false);

  // — Оценка именно нашего магазина Logovo —
  form.addSectionHeaderItem().setTitle('Оценка нашего магазина Logovo')
    .setHelpText('Если ты уже пользовался(ась) нашим Telegram-приложением — оцени его.');

  form.addScaleItem().setTitle('Общая оценка нашего приложения')
    .setBounds(1, 10).setLabels('Ужасно', 'Отлично').setRequired(false);

  form.addScaleItem().setTitle('Насколько удобно оформить заказ?')
    .setBounds(1, 5).setLabels('Очень неудобно', 'Очень удобно').setRequired(false);

  form.addScaleItem().setTitle('Насколько понятны каталог и цены?')
    .setBounds(1, 5).setLabels('Запутанно', 'Всё ясно').setRequired(false);

  form.addScaleItem().setTitle('Как тебе внешний вид и дизайн приложения?')
    .setBounds(1, 5).setLabels('Не нравится', 'Очень нравится').setRequired(false);

  form.addCheckboxItem().setTitle('Что понравилось больше всего?').setRequired(false)
    .setChoiceValues([
      'Дизайн и оформление',
      'Скорость и удобство',
      'Цены',
      'Система бонусов (+30%)',
      'Кейсы / рулетка',
      'Подписки',
      'Поддержка и общение',
    ]).showOtherOption(true);

  form.addParagraphTextItem()
    .setTitle('Заметил(а) недочёты, баги или что-то неудобное в нашем приложении?')
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Какие функции или товары ты хотел(а) бы видеть у нас?')
    .setRequired(false);

  form.addScaleItem().setTitle('Насколько вероятно, что ты порекомендуешь нас друзьям?')
    .setBounds(0, 10).setLabels('Точно нет', 'Обязательно порекомендую').setRequired(false);

  form.addMultipleChoiceItem().setTitle('Готов(а) ли ты сделать у нас покупку (или повторить)?').setRequired(false)
    .setChoiceValues(['Да, точно', 'Скорее да', 'Пока думаю', 'Скорее нет']);

  // — Контакт для промокода —
  form.addSectionHeaderItem().setTitle('Куда прислать промокод 🎁')
    .setHelpText('Оставь Telegram, чтобы мы отправили тебе случайный промокод на пополнение PlayStation / App Store.');

  form.addTextItem().setTitle('Твой Telegram (@username)').setRequired(false);

  Logger.log('✅ Готово!');
  Logger.log('editUrl (редактирование): ' + form.getEditUrl());
  Logger.log('liveUrl (для рассылки ЦА): ' + form.getPublishedUrl());
  return form.getPublishedUrl();
}
