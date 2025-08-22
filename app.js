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

/**
 * ✅ 1) HTTP-сервер: эндпоинт для создания invoice-link под Stars
 * MiniApp будет дергать этот URL, чтобы получить ссылку и открыть окно оплаты.
 */
const app = express()
app.use(cors({ origin: webAppUrl }))

app.get('/api/create-invoice', async (req, res) => {
  try {
    const userId = Number(req.query.user_id)
    if (!userId) return res.status(400).json({ error: 'user_id is required' })

    const STARS_PRICE = 10000 // цена в звёздах

    const invoiceLink = await bot.telegram.createInvoiceLink({
      title: 'Boost',
      description: 'Активирует Boost на 30 дней',
      payload: JSON.stringify({ type: 'boost', user_id: userId }),
      currency: 'XTR', // валюта Stars
      prices: [{ label: 'Boost', amount: STARS_PRICE }]
    })

    return res.json({ invoiceLink })
  } catch (e) {
    console.error('create-invoice error:', e)
    return res.status(500).json({ error: e?.message ?? 'internal_error' })
  }
})

/**
 * ✅ 2) Ответ на pre_checkout_query (обязателен!)
 */
bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true)
  } catch (e) {
    console.error('pre_checkout_query error:', e)
  }
})

/**
 * ✅ 3) Факт успешной оплаты: включаем boost в базе
 */
bot.on('successful_payment', async (ctx) => {
  try {
    const tgId = ctx.from.id

    await supabase
      .from('users')
      .update({ boost: true })
      .eq('telegram', tgId)

    await ctx.reply('✅ Boost активирован! Спасибо за оплату.')
  } catch (e) {
    console.error('successful_payment error:', e)
    await ctx.reply('⚠️ Оплата прошла, но не смогли обновить статус. Напишите в поддержку.')
  }
})

// Запуск бота (long polling)
bot.launch()

// Запуск HTTP-сервера (для MiniApp)
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`HTTP API listening on :${PORT}`)
})