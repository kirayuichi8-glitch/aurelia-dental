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
    const response = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: data.get('name'), phone: data.get('phone'), service: data.get('service'), consent: data.get('consent') === 'on', source: 'website' }) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Ошибка отправки');
    status.className = 'form-status success'; status.textContent = '✓ ' + result.message;
    leadForm.reset();
    setTimeout(closeModal, 2600);
  } catch (error) {
    status.className = 'form-status success'; status.textContent = '✓ Демо-заявка принята. В проекте для клиента здесь подключается CRM.'; localStorage.setItem('aurelia-demo-lead', JSON.stringify({name:data.get('name'), phone:data.get('phone'), service:data.get('service')})); leadForm.reset();
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
];

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
  const match = assistantKnowledge.find((item) => item.keys.some((key) => normalized.includes(key)));
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
  document.addEventListener('pointermove', (event) => {
    document.documentElement.style.setProperty('--mx', `${event.clientX}px`);
    document.documentElement.style.setProperty('--my', `${event.clientY}px`);
  }, { passive: true });
}
