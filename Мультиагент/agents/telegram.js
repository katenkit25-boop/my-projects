// Роль 4: Телеграм-агент — верстает готовый текст в HTML для Telegram.
import { askClaude } from "../lib/claude.js";

export async function telegramFormatter(postText) {
  const prompt = `Свёрстай этот текст для публикации в Telegram.

Правила:
- разрешены ТОЛЬКО HTML-теги: <b>, <i>, <a href="">. Никакого markdown (** __ [] ()).
- короткие абзацы, пустые строки между смысловыми блоками
- в конце — 3-5 подходящих хэштегов

Текст:
${postText}

Верни только готовый HTML-пост.`;
  return askClaude(prompt);
}
