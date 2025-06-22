import { Telegraf,  Markup } from 'telegraf';

import dotenv from 'dotenv';
dotenv.config();

const token = process.env.BOT_TOKEN;
const webAppUrl = 'https://pincoinbot.web.app';

const bot = new Telegraf(token);

bot.start((ctx) => {
  const ref = ctx.startPayload || '';
  ctx.reply(
    `${webAppUrl}?ref=${ref}`,
    Markup.inlineKeyboard([
      Markup.button.webApp('Open App', `${webAppUrl}?ref=${ref}`)
    ])
  );
});

bot.launch()