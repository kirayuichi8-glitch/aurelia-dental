const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); } });
}, { threshold: .12 });
$$('.reveal').forEach((element) => observer.observe(element));

const menuButton = $('.menu-btn');
const mobileMenu = $('.mobile-menu');
menuButton?.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  menuButton.classList.toggle('open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  mobileMenu.setAttribute('aria-hidden', String(!open));
});
$$('.mobile-menu a').forEach((link) => link.addEventListener('click', () => {
  mobileMenu.classList.remove('open'); menuButton.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false');
}));

const modal = $('.modal');
const leadForm = $('#lead-form');
const serviceSelect = $('[name="service"]', leadForm);
const openModal = (service) => {
  if (service) {
    const option = [...serviceSelect.options].find((item) => service.includes(item.value) || item.value.includes(service));
    if (option) serviceSelect.value = option.value;
  }
  modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('[name="name"]', leadForm).focus(), 150);
};
const closeModal = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
$$('.js-open-form').forEach((button) => button.addEventListener('click', () => openModal(button.dataset.service)));
$('.modal-close').addEventListener('click', closeModal);
$('.modal-backdrop').addEventListener('click', closeModal);

const phoneInput = $('[name="phone"]', leadForm);
const dateInput = $('[name="preferred_date"]', leadForm);
dateInput.min = new Date().toISOString().slice(0, 10);
phoneInput.addEventListener('input', (event) => {
  const digits = event.target.value.replace(/\D/g, '').replace(/^8/, '7').slice(0, 11);
  if (!digits) return;
  const d = digits.startsWith('7') ? digits.slice(1) : digits;
  event.target.value = `+7${d.length ? ' (' + d.slice(0,3) : ''}${d.length >= 3 ? ')' : ''}${d.length > 3 ? ' ' + d.slice(3,6) : ''}${d.length > 6 ? '-' + d.slice(6,8) : ''}${d.length > 8 ? '-' + d.slice(8,10) : ''}`;
});

leadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('.form-status', leadForm);
  const submit = $('.submit-btn', leadForm);
  const data = new FormData(leadForm);
  submit.disabled = true; submit.firstChild.textContent = 'Отправляем… ';
  status.className = 'form-status'; status.textContent = '';
  try {
    const response = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: data.get('name'), phone: data.get('phone'), service: data.get('service'), preferred_date: data.get('preferred_date'), preferred_time: data.get('preferred_time'), consent: data.get('consent') === 'on', source: 'website' }) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Ошибка отправки');
    status.className = 'form-status success'; status.textContent = '✓ ' + result.message;
    if (result.reminder_url) {
      const reminderLink = document.createElement('a');
      reminderLink.className = 'telegram-reminder-link';
      reminderLink.href = result.reminder_url;
      reminderLink.target = '_blank';
      reminderLink.rel = 'noopener';
      reminderLink.textContent = 'Получать напоминания в Telegram';
      status.append(reminderLink);
    }
    leadForm.reset();
    if (!result.reminder_url) setTimeout(closeModal, 2600);
  } catch (error) {
    status.className = 'form-status error'; status.textContent = error.message;
  } finally {
    submit.disabled = false; submit.firstChild.textContent = 'Записаться ';
  }
});

const chat = $('.chat-panel');
const messages = $('.chat-messages');
const quickReplies = $('.quick-replies');
const chatForm = $('.chat-input');
let chatStarted = false;

const assistantKnowledge = [
  { keys: ['болит','боль','острая','опух','температур'], text: 'При острой боли постараемся принять вас сегодня. Если есть сильный отёк, температура или трудно дышать — нужна срочная очная помощь. Подобрать ближайшее время?', quick: ['Записаться сегодня','Сколько стоит приём?'] },
  { keys: ['цен','стоит','стоимость','прайс','дорого'], text: 'Первичная диагностика — от 1 900 ₽, лечение кариеса — от 6 500 ₽, имплантация — от 39 000 ₽. Точную сумму врач фиксирует после диагностики, до начала лечения. Что вас интересует?', quick: ['Лечение зубов','Имплантация','Эстетика'] },
  { keys: ['имплант','нет зуб','удалил'], text: 'Имплантацию проводим по цифровому протоколу. Имплант — от 39 000 ₽, действует пожизненная гарантия производителя. На консультации врач оценит снимок и предложит варианты.', quick: ['Записаться на консультацию','Есть рассрочка?'] },
  { keys: ['рассроч','кредит','частями'], text: 'Да, лечение можно разделить на этапы или оформить рассрочку 0% до 12 месяцев. Администратор рассчитает удобный вариант после плана лечения.', quick: ['Получить план лечения'] },
  { keys: ['страш','боюсь','больно','анестез'], text: 'Понимаю вас — многие приходят с таким переживанием. Мы используем мягкую компьютерную анестезию, объясняем каждый шаг и делаем паузы по вашему сигналу. Можно начать только со знакомства.', quick: ['Записаться на знакомство','Как проходит приём?'] },
  { keys: ['ребен','детск','ребён'], text: 'Мы принимаем детей от 4 лет. Первый визит — адаптационный: знакомимся, показываем инструменты и не лечим без готовности ребёнка.', quick: ['Записать ребёнка','Стоимость осмотра'] },
  { keys: ['винир','отбел','эстет','улыбк'], text: 'Для изменения улыбки врач сначала делает цифровой эскиз: вы увидите будущий результат до начала работы. Отбеливание — от 18 000 ₽, виниры рассчитываются после диагностики.', quick: ['Хочу красивую улыбку','Записаться'] },
  { keys: ['адрес','находит','ехать','парков'], text: 'Мы находимся в Екатеринбурге, ул. Николая Никонова, 8. Рядом есть городская парковка. Работаем ежедневно с 08:00 до 21:00.', quick: ['Записаться','Позвонить'] },
  { keys: ['врач','доктор','специал'], text: 'В клинике принимают терапевт Елена Андреева, хирург-имплантолог Михаил Соколов и ортопед-эстетист Анна Ким. Помогу выбрать врача по вашей задаче.', quick: ['Болит зуб','Нужен имплант','Хочу виниры'] },
  { keys: ['кариес','дырк','пломб'], text: 'При кариесе врач сначала оценивает глубину поражения и делает прицельный снимок при необходимости. Лечение под увеличением — от 6 500 ₽. Точный объём определяют только после осмотра.', quick: ['Записаться на осмотр','Болит зуб'] },
  { keys: ['канал','пульпит','нерв'], text: 'Лечение каналов проходит под микроскопом и с контролем снимков. Количество посещений и стоимость зависят от числа каналов и состояния зуба. Заочно определить это безопасно нельзя.', quick: ['Записаться на диагностику','Узнать цены'] },
  { keys: ['десн','кровит','пародонт'], text: 'Кровоточивость и воспаление дёсен требуют осмотра пародонтолога и профессиональной диагностики. До визита используйте мягкую щётку и не прогревайте болезненную область.', quick: ['Записаться','Профессиональная чистка'] },
  { keys: ['чистк','камень','налет','гигиен'], text: 'Профессиональная гигиена удаляет мягкий налёт и зубной камень, а врач подбирает домашний уход. Обычно процедуру рекомендуют каждые 6–12 месяцев с учётом состояния дёсен.', quick: ['Записаться на чистку','Есть чувствительность'] },
  { keys: ['мудрост','восьмер','удален'], text: 'Перед удалением зуба мудрости хирург оценивает снимок и положение корней. Если есть нарастающий отёк, температура или трудно открывать рот — нужен срочный осмотр.', quick: ['Записаться к хирургу','Острая боль'] },
  { keys: ['коронк','мост','протез'], text: 'Коронка нужна, когда зуб сильно разрушен и пломбы недостаточно. Материал и стоимость врач подбирает после снимка и оценки прикуса; до начала работ согласуется цифровой план.', quick: ['Записаться к ортопеду','Имплантация'] },
  { keys: ['брекет','элайнер','прикус','ортодонт'], text: 'Исправление прикуса начинают с диагностики: фотографии, снимки и цифровые модели. После этого врач сравнит брекеты и элайнеры по срокам, ограничениям и стоимости.', quick: ['Записаться к ортодонту','Сколько длится лечение?'] },
  { keys: ['беремен','кормлен'], text: 'Во время беременности экстренное и необходимое стоматологическое лечение возможно, но сроки, снимки и препараты согласуют с врачом с учётом срока беременности. Сообщите об этом при записи.', quick: ['Записаться на консультацию'] },
  { keys: ['аллерг','лекарств','препарат'], text: 'Обязательно сообщите врачу обо всех аллергиях, хронических заболеваниях и лекарствах, особенно антикоагулянтах. Самостоятельно отменять назначенные препараты перед приёмом нельзя.', quick: ['Что взять на приём?','Записаться'] },
  { keys: ['снимок','рентген','кт','3d'], text: '3D-снимок помогает оценить корни, кость и положение зубов. Врач назначает только необходимый вид исследования и объясняет, зачем оно нужно.', quick: ['Записаться на диагностику','Адрес клиники'] },
  { keys: ['гарант'], text: 'Гарантия зависит от вида лечения и соблюдения рекомендаций. Условия фиксируются в документах; для имплантов действует гарантия производителя, а клиника ведёт контрольные осмотры.', quick: ['Имплантация','Записаться'] },
  { keys: ['документ','паспорт','взять'], text: 'На первый приём возьмите паспорт, имеющиеся снимки и список лекарств. Для ребёнка потребуются документы законного представителя.', quick: ['Как подготовиться?','Записаться'] },
  { keys: ['подготов','перед прием','перед приём'], text: 'Перед обычным приёмом поешьте за 1–2 часа, почистите зубы и возьмите имеющиеся снимки. Перед хирургической процедурой следуйте индивидуальным инструкциям врача.', quick: ['Что взять с собой?','Записаться'] },
  { keys: ['после удал','после имплант','после операц'], text: 'После хирургического лечения следуйте памятке врача: не прогревайте область, не трогайте лунку и принимайте только назначенные препараты. При сильном кровотечении, затруднении дыхания или быстро растущем отёке нужна срочная помощь.', quick: ['Связаться с клиникой','Записаться на осмотр'] },
  { keys: ['отмен','перенест','не при�׎��G����ƭy�ле выбора даты и времени в форме появится кнопка подключения Telegram. Бот напомнит о подтверждённом приёме за два часа и спросит, сможете ли вы прийти.', quick: ['Записаться','Как это работает?'] },
  { keys: ['сколько длит','время приема','долго'], text: 'Первичная консультация обычно занимает 30–60 минут. Продолжительность лечения зависит от процедуры; администратор уточнит время при подтверждении записи.', quick: ['Записаться','Выбрать врача'] },
  { keys: ['чувствитель','реагирует на холод'], text: 'Чувствительность может иметь разные причины — от истончения эмали до кариеса или воспаления. Если боль резкая, ночная или долго не проходит после раздражителя, не откладывайте осмотр.', quick: ['Записаться на диагностику','Острая боль'] },
  { keys: ['сколол','трещин','сломал зуб'], text: 'Скол или трещину лучше показать врачу как можно раньше. Не жуйте этой стороной, сохраните отколовшийся фрагмент, если он есть, и не пытайтесь приклеить его самостоятельно.', quick: ['Записаться сегодня','Болит зуб'] },
  { keys: ['выпала пломба','пломба выпала'], text: 'Если выпала пломба, избегайте твёрдой и очень горячей или холодной пищи этой стороной. Закрывать полость бытовыми материалами нельзя — врач оценит, можно ли восстановить зуб.', quick: ['Записаться сегодня'] },
  { keys: ['выбили зуб','травма зуба','ударил зуб'], text: 'При травме постоянного зуба нужна срочная помощь. Возьмите зуб только за коронку, не трите корень; по возможности поместите его в молоко и сразу звоните в клинику.', quick: ['Позвонить','Срочная запись'] },
  { keys: ['запах изо рта','неприятный запах'], text: 'Неприятный запах может быть связан с налётом, дёснами, кариесом или другими причинами. Начните с осмотра и профессиональной гигиены; маскирующие средства не заменяют диагностику.', quick: ['Записаться на чистку','Диагностика'] },
  { keys: ['стоматит','язва во рту','афта'], text: 'Большинство небольших язв проходит самостоятельно, но если они держатся более двух недель, часто повторяются, сопровождаются температурой или мешают глотать — нужен очный осмотр.', quick: ['Записаться на осмотр'] },
  { keys: ['можно есть после','есть после лечения'], text: 'После лечения ориентируйтесь на рекомендации врача. Пока сохраняется онемение, не ешьте горячее и не прикусывайте губу или щёку; после некоторых процедур ограничения отличаются.', quick: ['Сколько действует анестезия?'] },
  { keys: ['анестезия прошла','онемение','сколько действует анестезия'], text: 'Онемение обычно сохраняется несколько часов и зависит от препарата и зоны лечения. Если чувствительность необычно долго не возвращается или появились другие симптомы, свяжитесь с клиникой.', quick: ['Связаться с клиникой'] },
  { keys: ['срок имплантации','долго имплант','приживается имплант'], text: 'Срок имплантации зависит от состояния кости и выбранного протокола. После диагностики хирург составит этапный план; постоянную коронку обычно устанавливают после приживления импланта.', quick: ['Записаться к имплантологу'] },
  { keys: ['срок виниров','сколько служат виниры'], text: 'Срок службы виниров зависит от материала, прикуса, гигиены и контрольных осмотров. Перед лечением важно исключить противопоказания и согласовать форму улыбки на цифровом макете.', quick: ['Консультация по винирам'] },
  { keys: ['противопоказания отбеливание','можно отбеливание'], text: 'Перед отбеливанием врач проверяет эмаль, дёсны, пломбы и чувствительность. Процедуру не проводят при ряде состояний; безопасный вариант подбирают только после осмотра.', quick: ['Записаться на осмотр'] },
  { keys: ['налоговый вычет','справка для налоговой'], text: 'Для оплаченного лечения можно подготовить документы на налоговый вычет. Уточните у администратора, на кого оформлен договор и кто был плательщиком.', quick: ['Связаться с администратором'] },
  { keys: ['дмс','страховк'], text: 'Работа по ДМС зависит от конкретной страховой программы и договора клиники. Назовите страховую компанию администратору — он проверит возможность и порядок согласования.', quick: ['Оставить заявку'] },
  { keys: ['оплата картой','наличные','способ оплаты'], text: 'В клинике доступны основные способы оплаты. Итоговую стоимость и этапы фиксируют до начала лечения; варианты рассрочки администратор рассчитает отдельно.', quick: ['Есть рассрочка?'] },
  { keys: ['стерилизац','безопасност','инструмент'], text: 'Инструменты проходят обязательную предстерилизационную обработку и стерилизацию, одноразовые материалы вскрываются при пациенте. Подробности протокола можно уточнить на визите.', quick: ['Записаться'] },
  { keys: ['конфиденциаль','персональные данные'], text: 'Контактные и медицинские данные используются для обработки заявки и организации лечения. Диагнозы в открытые сообщения не отправляются; медицинские вопросы окончательно решаются на приёме.', quick: ['Как записаться?'] },
  { keys: ['инвалид','коляск','доступная среда'], text: 'Если нужна помощь с доступом или сопровождением, сообщите об этом при записи. Администратор уточнит доступность входа и подготовит удобный маршрут.', quick: ['Связаться с администратором'] },
  { keys: ['на дом','выезд врача'], text: 'Большинство стоматологических процедур требует оборудования клиники. Возможность консультации или специального сопровождения администратор уточнит индивидуально.', quick: ['Оставить заявку'] },
  { keys: ['второе мнение','другая клиника','план лечения'], text: 'Можно прийти за вторым мнением с имеющимися снимками и планом лечения. Врач проведёт собственную диагностику, объяснит варианты и не будет начинать процедуры без вашего согласия.', quick: ['Записаться на консультацию'] },
];

const assistantSessionId = sessionStorage.getItem('aurelia-assistant-session') || crypto.randomUUID();
sessionStorage.setItem('aurelia-assistant-session', assistantSessionId);
const logQuestion = (question, intent) => fetch('/api/assistant/log', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ session_id: assistantSessionId, question, intent }),
}).catch(() => {});

const addMessage = (text, role = 'bot') => {
  const bubble = document.createElement('div'); bubble.className = `message ${role}`; bubble.textContent = text; messages.append(bubble); messages.scrollTop = messages.scrollHeight;
};
const setQuick = (items = []) => {
  quickReplies.replaceChildren(...items.map((label) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = () => handleQuestion(label); return button; }));
};
const botReply = (text, quick) => {
  const typing = document.createElement('div'); typing.className = 'message bot typing'; typing.innerHTML = '<i></i><i></i><i></i>'; messages.append(typing); messages.scrollTop = messages.scrollHeight;
  setTimeout(() => { typing.remove(); addMessage(text); setQuick(quick); }, reducedMotion ? 0 : 650);
};
const handleQuestion = (question) => {
  if (!question.trim()) return;
  addMessage(question, 'user'); setQuick([]);
  const normalized = question.toLowerCase().replace('ё','е');
  if (normalized.includes('запис') || normalized.includes('план леч') || normalized.includes('сегодня')) {
    botReply('Конечно. Я открою короткую форму — укажите имя и телефон, и администратор подберёт удобное время.', ['Открыть форму записи']);
    setTimeout(() => openModal(normalized.includes('имплант') ? 'Имплантация' : undefined), reducedMotion ? 100 : 1300);
    return;
  }
  if (normalized.includes('позвон')) { location.href = 'tel:+73432872202'; return; }
  const match = assistantKnowledge
    .map((item) => ({ item, score: Math.max(0, ...item.keys.filter((key) => normalized.includes(key)).map((key) => key.length)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.item;
  logQuestion(question, match?.keys?.[0] || 'unknown');
  botReply(match?.text || 'Я могу подсказать цены, рассказать о лечении, имплантации, рассрочке, врачах и помочь записаться. Что для вас сейчас важнее всего?', match?.quick || ['Узнать цены','Боюсь лечить зубы','Записаться']);
};
const openChat = () => {
  chat.classList.add('open'); chat.setAttribute('aria-hidden', 'false');
  if (!chatStarted) { chatStarted = true; botReply('Здравствуйте! Я Аура, помощник клиники. Подскажу по услугам и ценам или помогу записаться. Что вас беспокоит?', ['Болит зуб','Узнать цены','Хочу красивую улыбку']); }
};
$$('.js-open-chat').forEach((button) => button.addEventListener('click', openChat));
$('.chat-close').addEventListener('click', () => { chat.classList.remove('open'); chat.setAttribute('aria-hidden', 'true'); });
chatForm.addEventListener('submit', (event) => { event.preventDefault(); const input = $('input', chatForm); handleQuestion(input.value); input.value = ''; });
quickReplies.addEventListener('click', (event) => { if (event.target.textContent === 'Открыть форму записи') openModal(); });

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeModal(); chat.classList.remove('open'); } });

if (!reducedMotion) {
  const finePointer = matchMedia('(pointer: fine)').matches;
  let frame = 0;
  document.addEventListener('pointermove', (event) => {
    if (!finePointer) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      document.body.classList.add('pointer-active');
      document.documentElement.style.setProperty('--mx', `${event.clientX}px`);
      document.documentElement.style.setProperty('--my', `${event.clientY}px`);
      const x = event.clientX / innerWidth - .5;
      const y = event.clientY / innerHeight - .5;
      $$('[data-parallax]').forEach((element) => {
        const power = Number(element.dataset.parallax || .025);
        element.style.transform = `translate3d(${x * innerWidth * power}px, ${y * innerHeight * power}px, 0) rotateX(${-y * 2.4}deg) rotateY(${x * 2.4}deg)`;
      });
    });
  }, { passive: true });

  document.addEventListener('mouseleave', () => document.body.classList.remove('pointer-active'));

  if (finePointer) {
    $$('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = `translateY(-8px) rotateX(${-y * 5}deg) rotateY(${x * 6}deg)`;
      }, { passive: true });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }
}
