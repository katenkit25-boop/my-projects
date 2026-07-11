// Роль 3: Дизайнер — придумывает обложку (через Claude) и рисует её (через OpenAI).
import { askClaude } from "../lib/claude.js";
import { generateImage } from "../lib/openai-image.js";

export async function designer(topic, postText, outPath) {
  // 1) Claude придумывает промпт для картинки
  const imagePrompt = await askClaude(
    `Ты — арт-директор. Придумай КОРОТКИЙ промпт (на английском) для обложки поста.
Тема: «${topic}».
Текст поста:
${postText}

Верни ТОЛЬКО промпт для генератора картинок (1-2 предложения), без кавычек и пояснений.`
  );

  // 2) OpenAI рисует картинку по этому промпту
  const imagePath = await generateImage(imagePrompt, outPath);
  return { imagePrompt, imagePath };
}
