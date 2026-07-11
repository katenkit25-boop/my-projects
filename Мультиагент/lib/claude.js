// lib/claude.js — обёртка над Claude Code CLI.
// Текст-агенты работают на ПОДПИСКЕ (без API-ключа): просто запускаем команду `claude`.
// Способ вызова повторяет рабочий бот агента (claude -p --output-format json).
import { spawn } from "node:child_process";
import { config } from "../config.js";

/**
 * Задать вопрос Claude Code и получить текст ответа.
 * @param {string} prompt - что спросить/поручить
 * @param {object} opts - { model, webSearch, timeoutMs }
 * @returns {Promise<string>} текст ответа
 */
export function askClaude(prompt, opts = {}) {
  const model = opts.model || config.models.text;
  const timeoutMs = opts.timeoutMs || 300000; // 5 минут на ответ

  return new Promise((resolve, reject) => {
    const args = [
      "-p", prompt,
      "--output-format", "json",
      // web-поиску нужно несколько «ходов» (поиск → чтение → ответ), иначе хватит и пары
      "--max-turns", opts.webSearch ? "15" : "3",
      "--model", model,
      "--dangerously-skip-permissions", // headless-режим: без запросов подтверждений
    ];

    const child = spawn("claude", args, {
      env: process.env, // HOME берётся из окружения → используется подписка агента
      timeout: timeoutMs,
    });
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("error", (err) =>
      reject(new Error(`Не удалось запустить claude: ${err.message}`))
    );

    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(`Claude завершился с ошибкой (${code}): ${stderr.slice(0, 300)}`));
      }
      // В режиме json ответ лежит в поле result
      try {
        const obj = JSON.parse(stdout);
        resolve((obj.result || obj.text || "").trim());
      } catch {
        resolve(stdout.trim()); // на всякий случай — вернём как есть
      }
    });
  });
}
