// orchestrator.js — дирижёр. Ведёт тему по всем ролям по очереди и собирает готовый пост.
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { marketer } from "./agents/marketer.js";
import { copywriter } from "./agents/copywriter.js";
import { designer } from "./agents/designer.js";
import { telegramFormatter } from "./agents/telegram.js";
import { editor } from "./agents/editor.js";

const DRAFTS_DIR = join(process.cwd(), "drafts");

/**
 * Собрать пост по теме, прогнав через 5 ролей.
 * @param {string} topic - тема поста
 * @param {(step: string) => void} onStep - колбэк прогресса (можно слать в Telegram)
 * @returns {Promise<{ text: string, imagePath: string|null }>}
 */
export async function buildPost(topic, onStep = () => {}) {
  await mkdir(DRAFTS_DIR, { recursive: true });

  onStep("🔍 Маркетолог собирает факты…");
  const brief = await marketer(topic);

  onStep("✍️ Копирайтер пишет текст…");
  const draft = await copywriter(topic, brief);

  onStep("🎨 Дизайнер рисует обложку…");
  const imagePath = join(DRAFTS_DIR, `cover-${Date.now()}.png`);
  let cover = null;
  try {
    const res = await designer(topic, draft, imagePath);
    cover = res.imagePath;
  } catch (e) {
    // Картинка — не критично: если OpenAI подвёл, публикуем текстом
    onStep(`⚠️ Обложку сделать не вышло (${e.message}). Пойдём без картинки.`);
  }

  onStep("📲 Верстаю под Telegram…");
  const html = await telegramFormatter(draft);

  onStep("✅ Финальный редактор проверяет…");
  const finalText = await editor(html);

  return { text: finalText, imagePath: cover };
}
