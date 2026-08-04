const html = __HTML__;
const css = __CSS__;
const enhancements = __ENHANCEMENTS__;
const javascript = __JAVASCRIPT__;

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const json = (data, status = 200, extra = {}) => Response.json(data, {
  status,
  headers: { ...securityHeaders, "cache-control": "no-store", ...extra },
});

function response(body, type, status = 200) {
  return new Response(body, {
    status,
    headers: { ...securityHeaders, "content-type": type, "cache-control": status === 200 ? "public, max-age=300" : "no-store" },
  });
}

const clean = (value, length = 100) => String(value || "").trim().slice(0, length);
const telegramUrl = (env, method) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

async function sendTelegram(env, chatId, text, replyMarkup) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return { ok: false, skipped: true };
  try {
    const body = { chat_id: chatId, text, disable_web_page_preview: true };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const result = await fetch(telegramUrl(env, "sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await result.json();
  } catch (error) {
    console.error("sendTelegram", error);
    return { ok: false, error: "telegram_unavailable" };
  }
}

async function answerCallback(env, callbackId, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !callbackId) return;
  await fetch(telegramUrl(env, "answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

async function createLead(request, env) {
  try {
    if (!env.DB) return json({ ok: false, message: "Сервис записи временно не подключён." }, 503);
    const data = await request.json();
    const name = clean(data.name, 80);
    const phone = clean(data.phone, 30).replace(/[^+\d() -]/g, "");
    const service = clean(data.service || "Консультация", 100);
    const source = clean(data.source || "site", 30);
    const preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(clean(data.preferred_date, 10)) ? clean(data.preferred_date, 10) : null;
    const preferredTime = /^\d{2}:\d{2}$/.test(clean(data.preferred_time, 5)) ? clean(data.preferred_time, 5) : null;
    if (name.length < 2 || phone.replace(/\D/g, "").length < 10 || data.consent !== true) {
      return json({ ok: false, message: "Проверьте имя, телефон и согласие." }, 400);
    }

    const leadId = crypto.randomUUID();
    const appointmentId = preferredDate && preferredTime ? crypto.randomUUID() : null;
    const reminderToken = appointmentId ? crypto.randomUUID().replaceAll("-", "") : null;
    const startsAt = appointmentId ? `${preferredDate}T${preferredTime}:00+05:00` : null;
    if (startsAt && (!Number.isFinite(Date.parse(startsAt)) || Date.parse(startsAt) <= Date.now() + 30 * 60 * 1000)) {
      return json({ ok: false, message: "Выберите время минимум через 30 минут." }, 400);
    }

    const statements = [
      env.DB.prepare("INSERT INTO leads (id, name, phone, service, source, status, preferred_date, preferred_time, consent_at) VALUES (?, ?, ?, ?, ?, 'new', ?, ?, CURRENT_TIMESTAMP)")
        .bind(leadId, name, phone, service, source, preferredDate, preferredTime),
    ];
    if (appointmentId) {
      statements.push(env.DB.prepare("INSERT INTO appointments (id, lead_id, starts_at, timezone, status, reminder_token) VALUES (?, ?, ?, 'Asia/Yekaterinburg', 'requested', ?)")
        .bind(appointmentId, leadId, startsAt, reminderToken));
    }
    await env.DB.batch(statements);

    const adminText = [
      "Новая заявка Aurelia",
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      `Услуга: ${service}`,
      startsAt ? `Желаемое время: ${preferredDate} ${preferredTime}` : "Время: подобрать по телефону",
      `Заявка: ${leadId}`,
    ].join("\n");
    const adminKeyboard = appointmentId ? {
      inline_keyboard: [[
        { text: "Подтвердить время", callback_data: `confirm:${appointmentId}` },
        { text: "Перенести", callback_data: `reschedule:${appointmentId}` },
      ]],
    } : undefined;
    await sendTelegram(env, env.TELEGRAM_ADMIN_CHAT_ID, adminText, adminKeyboard);

    const reminderUrl = appointmentId && env.TELEGRAM_BOT_USERNAME
      ? `https://t.me/${String(env.TELEGRAM_BOT_USERNAME).replace(/^@/, "")}?start=a_${reminderToken}`
      : null;
    return json({
      ok: true,
      id: leadId,
      appointment_id: appointmentId,
      reminder_url: reminderUrl,
      message: startsAt
        ? "Заявка принята. Администратор подтвердит выбранное время."
        : "Заявка принята. Администратор свяжется с вами в течение 10 минут.",
    });
  } catch (error) {
    console.error("createLead", error);
    return json({ ok: false, message: "Не удалось отправить заявку. Позвоните нам: +7 (343) 287-22-02." }, 500);
  }
}

async function logAssistant(request, env) {
  if (!env.DB) return json({ ok: true });
  try {
    const data = await request.json();
    await env.DB.prepare("INSERT INTO conversation_events (id, session_id, question, intent) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), clean(data.session_id, 80), clean(data.question, 500), clean(data.intent || "unknown", 80)).run();
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 400);
  }
}

async function notifyAdmin(env, text) {
  return sendTelegram(env, env.TELEGRAM_ADMIN_CHAT_ID, text);
}

async function handleTelegramWebhook(request, env) {
  if (env.TELEGRAM_WEBHOOK_SECRET && request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ ok: false }, 401);
  }
  if (!env.DB) return json({ ok: false }, 503);
  const update = await request.json();
  const message = update.message;
  const callback = update.callback_query;

  if (message?.text?.startsWith("/start a_")) {
    const match = message.text.match(/^\/start a_([0-9a-f]+)$/i);
    if (!match) return json({ ok: true });
    const appointment = await env.DB.prepare("SELECT a.id, a.starts_at, a.status, l.name FROM appointments a JOIN leads l ON l.id = a.lead_id WHERE a.reminder_token = ?")
      .bind(match[1]).first();
    if (!appointment) {
      await sendTelegram(env, message.chat.id, "Ссылка устарела или запись не найдена.");
      return json({ ok: true });
    }
    await env.DB.prepare("UPDATE appointments SET patient_chat_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(String(message.chat.id), appointment.id).run();
    await sendTelegram(env, message.chat.id, `Напоминания подключены, ${appointment.name}. Мы сообщим о подтверждении и напомним за два часа.`);
    await notifyAdmin(env, `Пациент подключил Telegram-напоминания\nЗапись: ${appointment.id}`);
    return json({ ok: true });
  }

  if (callback) {
    const [action, appointmentId] = String(callback.data || "").split(":");
    const appointment = await env.DB.prepare("SELECT a.*, l.name, l.phone FROM appointments a JOIN leads l ON l.id = a.lead_id WHERE a.id = ?")
      .bind(appointmentId).first();
    if (!appointment) {
      await answerCallback(env, callback.id, "Запись не найдена");
      return json({ ok: true });
    }

    const fromChat = String(callback.message?.chat?.id || callback.from?.id || "");
    const isAdmin = fromChat === String(env.TELEGRAM_ADMIN_CHAT_ID || "");
    if (action === "confirm" && isAdmin) {
      await env.DB.prepare("UPDATE appointments SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(appointmentId).run();
      if (appointment.patient_chat_id) await sendTelegram(env, appointment.patient_chat_id, `Ваша запись подтверждена: ${appointment.starts_at.replace("T", " ").slice(0, 16)}. Напомним за два часа.`);
      await answerCallback(env, callback.id, "Время подтверждено");
    } else if (action === "reschedule") {
      await env.DB.prepare("UPDATE appointments SET status = 'reschedule_requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(appointmentId).run();
      await notifyAdmin(env, `Нужно перенести запись\n${appointment.name}, ${appointment.phone}\nЗапись: ${appointmentId}`);
      await answerCallback(env, callback.id, "Администратор свяжется для переноса");
    } else if (action === "attend") {
      await env.DB.prepare("UPDATE appointments SET status = 'patient_confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(appointmentId).run();
      await notifyAdmin(env, `Пациент подтвердил визит\n${appointment.name}, ${appointment.phone}`);
      await answerCallback(env, callback.id, "Спасибо, ждём вас!");
    }
    return json({ ok: true });
  }
  return json({ ok: true });
}

async function runReminders(env) {
  if (!env.DB) return { checked: 0, sent: 0 };
  const result = await env.DB.prepare("SELECT a.id, a.starts_at, a.patient_chat_id, l.name FROM appointments a JOIN leads l ON l.id = a.lead_id WHERE a.status IN ('confirmed','patient_confirmed') AND a.patient_chat_id IS NOT NULL AND a.reminder_sent_at IS NULL AND unixepoch(a.starts_at) BETWEEN unixepoch('now','+90 minutes') AND unixepoch('now','+150 minutes') LIMIT 100").all();
  let sent = 0;
  for (const appointment of result.results || []) {
    const delivery = await sendTelegram(env, appointment.patient_chat_id, `Напоминаем: приём в Aurelia через два часа — ${appointment.starts_at.replace("T", " ").slice(0, 16)}. Вы придёте?`, {
      inline_keyboard: [[
        { text: "Да, приду", callback_data: `attend:${appointment.id}` },
        { text: "Нужно перенести", callback_data: `reschedule:${appointment.id}` },
      ]],
    });
    if (delivery.ok) {
      await env.DB.prepare("UPDATE appointments SET reminder_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(appointment.id).run();
      sent += 1;
    }
  }
  return { checked: (result.results || []).length, sent };
}

async function setupTelegramWebhook(request, env) {
  const auth = request.headers.get("authorization");
  if (!env.REMINDER_SECRET || auth !== `Bearer ${env.REMINDER_SECRET}`) return json({ ok: false }, 401);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return json({ ok: false, message: "Telegram secrets are missing" }, 503);
  const origin = new URL(request.url).origin;
  const result = await fetch(telegramUrl(env, "setWebhook"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: `${origin}/api/telegram/webhook`, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"] }),
  });
  return json(await result.json(), result.ok ? 200 : 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/leads") return createLead(request, env);
    if (request.method === "POST" && url.pathname === "/api/assistant/log") return logAssistant(request, env);
    if (request.method === "POST" && url.pathname === "/api/telegram/webhook") return handleTelegramWebhook(request, env);
    if (request.method === "POST" && url.pathname === "/api/telegram/setup") return setupTelegramWebhook(request, env);
    if (request.method === "POST" && url.pathname === "/api/reminders/run") {
      if (!env.REMINDER_SECRET || request.headers.get("authorization") !== `Bearer ${env.REMINDER_SECRET}`) return json({ ok: false }, 401);
      return json({ ok: true, ...(await runReminders(env)) });
    }
    if (request.method !== "GET") return response("Method not allowed", "text/plain; charset=utf-8", 405);
    if (url.pathname === "/" || url.pathname === "/index.html") return response(html.replaceAll("{{ORIGIN}}", url.origin), "text/html; charset=utf-8");
    if (url.pathname === "/styles.css") return response(css, "text/css; charset=utf-8");
    if (url.pathname === "/enhancements.css") return response(enhancements, "text/css; charset=utf-8");
    if (url.pathname === "/app.js") return response(javascript, "text/javascript; charset=utf-8");
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return response("Страница не найдена", "text/plain; charset=utf-8", 404);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
};
