// lib/openai-image.js — генерация картинок через OpenAI.
// Модель берётся из .env (IMAGE_MODEL): по умолчанию gpt-image-1.
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { config } from "../config.js";

const client = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Сгенерировать картинку и сохранить в файл.
 * @param {string} prompt - описание картинки (лучше на английском)
 * @param {string} outPath - куда сохранить (напр. drafts/cover.png)
 * @returns {Promise<string>} путь к сохранённому файлу
 */
export async function generateImage(prompt, outPath) {
  const res = await client.images.generate({
    model: config.models.image,
    prompt,
    size: "1024x1024",
    n: 1,
  });

  const item = res.data?.[0];
  if (!item) throw new Error("OpenAI не вернул картинку");

  // gpt-image-1 отдаёт base64, dall-e-3 обычно отдаёт ссылку — поддержим оба варианта
  if (item.b64_json) {
    await writeFile(outPath, Buffer.from(item.b64_json, "base64"));
  } else if (item.url) {
    const img = await fetch(item.url);
    await writeFile(outPath, Buffer.from(await img.arrayBuffer()));
  } else {
    throw new Error("OpenAI вернул ответ без картинки");
  }

  return outPath;
}
