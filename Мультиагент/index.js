// index.js — Telegram-бот на polling (без вебхуков).
// Дирижирует ролями, присылает пост тебе на проверку и публикует ТОЛЬКО после «да».
import { Bot, InputFile } from "grammy";
import cron from "node-cron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { buildPost } from "./orchestrator.js";
import { askClaude } from "./lib/claude.js";

const bot = new Bot(config.telegram.botToken);
const PLAN_PATH = join(process.cwd(), "content-plan.md");

// Один пост «на проверке» за раз + флаг занятости (чтобы не запускать две генерации разом)
let pending = null; // { topic, text, imagePath }
let busy = false;

// ─── Отправка поста (фото с подписью или просто текст) ───
async function sendPost(target, post) {
  const { text, imagePath } = post;
  if (imagePath) {
    if (text.length <= 1024) {
      await bot.api.sendPhoto(target, new InputFile(imagePath), { caption: text, parse_mode: "HTML" });
    } else {
      // Подпись к фото не длиннее 1024 символов → шлём фото, потом текст отдельно
      await bot.api.sendPhoto(target, new InputFile(imagePath));
      await bot.api.sendMessage(target, text, { parse_mode: "HTML" });
    }
  } else {
    await bot.api.sendMessage(target, text, { parse_mode: "HTML" });
  }
}

// ─── Взять следующую тему из content-plan.md (первая строка «- [ ] …») ───
async function nextTopic() {
  try {
    const text = await readFile(PLAN_PATH, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^- \[ \]\s+(.+)$/);
      if (m) return m[1].trim();
    }
  } catch {}
  return null;
}

// Отметить тему опубликованной: «- [ ] тема» → «- [x] тема»
async function markTopicDone(topic) {
  try {
    let text = await readFile(PLAN_PATH, "utf8");
    text = text.replace(`- [ ] ${topic}`, `- [x] ${topic}`);
    await writeFile(PLAN_PATH, text);
  } catch {}
}

// ─── Сгенерировать пост и прислать на проверку ───
async function generateAndReview(topic, chatId) {
  if (busy) {
    await bot.api.sendMessage(chatId, "⏳ Уже собираю пост — дождись его, потом запустим следующий.");
    return;
  }
  busy = true;
  try {
    await bot.api.sendMessage(chatId, `Беру тему: «${topic}»\n⏳ Запускаю 5 ролей…`);
    const onStep = (s) => bot.api.sendMessage(chatId, s).catch(() => {});

    const post = await buildPost(topic, onStep);
    pending = { topic, ...post };

    await sendPost(chatId, post);
    await bot.api.sendMessage(chatId,
      "👆 Публикуем в канал?\n\n✅ ответь «да»\n✏️ «правки: …» — что поменять\n❌ «нет» — отклонить");
  } catch (e) {
    await bot.api.sendMessage(chatId, `❌ Ошибка при сборке поста: ${e.message}`);
  } finally {
    busy = false;
  }
}

// ─── Опубликовать одобренный пост в канал ───
async function publish(chatId) {
  if (!pending) return;
  try {
    await sendPost(config.telegram.channelId, pending);
    await markTopicDone(pending.topic);
    await bot.api.sendMessage(chatId, "✅ Опубликовано в канал!");
    pending = null;
  } catch (e) {
    // Ошибка публикации → тему НЕ помечаем сделанной, пост остаётся «на проверке»
    await bot.api.sendMessage(chatId, `❌ Не удалось опубликовать: ${e.message}\nСтатус не изменён — можно попробовать ещё раз («да»).`);
  }
}

// ─── Внести правки в текст поста ───
async function revise(chatId, instructions) {
  if (!pending) return;
  if (busy) { await bot.api.sendMessage(chatId, "⏳ Подожди, идёт работа."); return; }
  busy = true;
  try {
    await bot.api.sendMessage(chatId, "✏️ Вношу правки…");
    pending.text = await askClaude(
      `Внеси правки в пост для Telegram. Сохрани HTML-теги (<b>, <i>, <a>), без markdown.
Правки: ${instructions}

Текущий пост:
${pending.text}

Верни только исправленный HTML-пост.`
    );
    await sendPost(chatId, pending);
    await bot.api.sendMessage(chatId, "Так лучше? ✅ «да» / ✏️ «правки: …» / ❌ «нет»");
  } catch (e) {
    await bot.api.sendMessage(chatId, `❌ Ошибка правок: ${e.message}`);
  } finally {
    busy = false;
  }
}

// ─── Команды ───
bot.command("start", (ctx) =>
  ctx.reply(
    "Привет! Я мультиагентный контент-бот.\n\n" +
    "• /post <тема> — собрать пост на заданную тему\n" +
    `• каждый день в ${config.postTime} беру следующую тему из content-plan.md автоматически\n\n` +
    "Готовый пост присылаю тебе на проверку — публикую в канал только после «да»."
  )
);

bot.command("post", (ctx) => {
  const topic = (ctx.match || "").trim();
  if (!topic) return ctx.reply("Напиши тему после команды, например:\n/post денежное мышление");
  return generateAndReview(topic, ctx.chat.id);
});

// ─── Твои ответы на проверке (да / правки / нет) ───
bot.on("message:text", async (ctx) => {
  if (String(ctx.from.id) !== String(config.telegram.adminId)) return; // реагируем только на тебя
  if (!pending) return; // нечего одобрять
  const raw = ctx.message.text.trim();
  const t = raw.toLowerCase();

  if (t === "да" || t.startsWith("публик")) return publish(ctx.chat.id);
  if (t.startsWith("правк")) {
    const instr = raw.replace(/^правки?:?\s*/i, "").trim();
    return revise(ctx.chat.id, instr || "сделай короче и живее");
  }
  if (t === "нет" || t.startsWith("отклон")) {
    pending = null;
    return ctx.reply("❌ Отклонено. В канал не пошло.");
  }
});

// ─── Расписание: каждый день в POST_TIME ───
const [hh, mm] = config.postTime.split(":");
cron.schedule(`${Number(mm)} ${Number(hh)} * * *`, async () => {
  const topic = await nextTopic();
  if (!topic) {
    await bot.api.sendMessage(config.telegram.adminId,
      "📭 Темы в content-plan.md закончились. Добавь новые строкой «- [ ] тема».").catch(() => {});
    return;
  }
  await generateAndReview(topic, config.telegram.adminId);
});

// ─── Запуск (long polling, без вебхуков) ───
bot.start();
console.log(`🤖 Мультиагентный бот запущен (polling). Автопост в ${config.postTime}.`);
