import axios from "axios";
import { config } from "./config.js";

export async function notifyTelegram(text: string): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — skipping notify");
    console.log("[telegram] would send:\n" + text);
    return;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const { data, status } = await axios.post(
    url,
    {
      chat_id: config.telegramChatId,
      text,
      disable_web_page_preview: false,
    },
    { validateStatus: () => true },
  );

  if (status >= 400 || data?.ok === false) {
    throw new Error(`Telegram error: ${JSON.stringify(data)}`);
  }
}
