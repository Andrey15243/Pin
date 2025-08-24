import { Telegraf, Markup } from 'telegraf'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const token = process.env.BOT_TOKEN
const webAppUrl = 'https://pincoinbot.web.app'

// ✅ Supabase (используем service role key ТОЛЬКО на сервере!)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const bot = new Telegraf(token)

// Вынес функция отправки invoice, чтобы не дублировать код
const sendBoostInvoice = async (ctx) => {
  try {
    const STARS_PRICE = 1; // 1 Star
    await ctx.replyWithInvoice({
      title: 'Boost',
      description: 'Activate Boost (Unlimited)',
      payload: String(ctx.from.id),
      provider_token: '', // для Stars
      currency: 'XTR',
      prices: [{ label: 'Boost', amount: STARS_PRICE }]
    })
  } catch (e) {
    console.error('sendInvoice error:', e)
    ctx.reply('❌ Не удалось создать счёт')
  }
}

// Кнопка «Open App»
bot.start((ctx) => {
  const ref = ctx.startPayload || ''
  return ctx.reply(
    'Welcome to Pincoin!',
    Markup.inlineKeyboard([
      Markup.button.webApp('Open App', `${webAppUrl}?ref=${ref}`)
    ])
  )
})

bot.command("terms", (ctx) => {
  ctx.reply(
    "📄 Terms of Use:\n\n" +
    "1. This service is paid and requires Telegram Stars for activation.\n" +
    "2. Payments are processed exclusively via Telegram Stars (XTR).\n" +
    "3. By making a payment, you agree to activate the Boost service for your account.\n" +
    "4. All digital goods are non-refundable.\n" +
    "5. For support, contact us via /support."
  );
});

bot.command("support", (ctx) => {
  ctx.reply("🆘 @pin_support");
});

// 1) Команды
bot.command('sendstars', sendBoostInvoice)

// 2) Универсальный обработчик сообщений
bot.on('message', async (ctx) => {
  const msg = ctx.update?.message

  // Успешная оплата
  if (msg?.successful_payment) {
    try {
      const tgId = msg.from.id
      const { data, error } = await supabase
        .from('users')
        .update({ boost: true })
        .eq('telegram', tgId)
        .select('id')

      if (error) {
        console.error('Supabase update error:', error)
        await ctx.reply('⚠️ Оплата получена, но не смогли обновить статус.')
      } else if (!data || data.length === 0) {
        await ctx.reply('⚠️ Оплата получена, но профиль не найден.')
      } else {
        await ctx.reply('✅ Boost активирован! Спасибо за оплату.')
      }
    } catch (e) {
      console.error('successful_payment handler error:', e)
      await ctx.reply('⚠️ Оплата получена, но произошла ошибка. Напишите в поддержку.')
    }
    return
  }

  // Данные из MiniApp
  const webAppData = msg?.web_app_data?.data
  if (webAppData) {
    try {
      const data = JSON.parse(webAppData)
      if (data.command === 'sendstars') {
        await sendBoostInvoice(ctx)
      }
    } catch (e) {
      console.error('web_app_data JSON parse error:', e)
    }
  }
})

// 3) pre_checkout_query
bot.on('pre_checkout_query', async (ctx) => {
  try { await ctx.answerPreCheckoutQuery(true) }
  catch (e) { console.error('pre_checkout_query error:', e) }
})

// 4) Запуск бота
bot.launch()

// HTTP-сервер для MiniApp (если понадобятся future endpoints)
const app = express()
app.use(cors({ origin: webAppUrl }))
app.get('/', (req, res) => res.send('PincoinBot API running'))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`HTTP API listening on :${PORT}`)
})