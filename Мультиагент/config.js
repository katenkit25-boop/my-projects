// config.js — единая точка чтения настроек из .env.
// Все ключи и модели берутся ТОЛЬКО отсюда, чтобы не искать их по всему коду.
import "dotenv/config";

// Если обязательной переменной нет — сразу понятная ошибка, а не падение где-то внутри.
function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ В .env не заполнена переменная ${name}.`);
    console.error("   Скопируй .env.example в .env и впиши значения.");
    process.exit(1);
  }
  return value;
}

export const config = {
  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"), // токен бота от @BotFather
    channelId: required("TELEGRAM_CHANNEL_ID"), // куда публиковать: @канал или -100...
    adminId: required("TELEGRAM_ADMIN_ID"), // твой Telegram ID — кому слать на проверку
  },
  models: {
    // Модели переключаются прямо в .env, без правки кода.
    text: process.env.TEXT_MODEL || "sonnet", // текст-агенты (Claude Code, на подписке)
    image: process.env.IMAGE_MODEL || "gpt-image-1", // картинки (OpenAI)
  },
  openaiApiKey: required("OPENAI_API_KEY"), // нужен только для картинок
  postTime: process.env.POST_TIME || "10:00", // во сколько бот сам генерит пост
};
