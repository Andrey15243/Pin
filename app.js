import { Telegraf } from 'telegraf'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const bot = new Telegraf(process.env.BOT_TOKEN)

// Supabase (для хранения статуса Boost и рефералов)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Команда для покупки Boost
bot.command('buy_boost', async (ctx) => {
  try {
    // Предположим, что referrerId передан в ctx.session или ctx.startPayload
    const referrerId = ctx.startPayload || null;

    // payload с пользовательским ID и реферером
    const payload = JSON.stringify({
      type: 'boost',
      user_id: ctx.from.id,
      ref: referrerId
    });

    await ctx.sendInvoice({
      title: 'Boost',
      description: 'Активирует Boost на 30 дней',
      payload,              // обязательно строка
      currency: 'XTR',      // Telegram Stars
      prices: [{ label: 'Boost', amount: 10000 }] // цена в звёздах
    });

  } catch (e) {
    console.error('sendInvoice error:', e);
    await ctx.reply('❌ Не удалось создать инвойс.');
  }
});

// Обработка успешной оплаты
bot.on('successful_payment', async (ctx) => {
  try {
    const tgId = ctx.from.id;

    // Обновляем Boost в базе
    await supabase
      .from('users')
      .update({ boost: true })
      .eq('telegram', tgId);

    // Получаем payload для начисления бонуса рефереру
    const payload = JSON.parse(ctx.message.successful_payment.invoice_payload);
    if (payload.ref) {
      // Начисляем бонус рефереру (например, +1 звезда)
      await supabase
        .from('users')
        .update({ bonus_stars: 1 })
        .eq('telegram', payload.ref);
    }

    await ctx.reply('✅ Boost активирован! Спасибо за оплату.');
  } catch (e) {
    console.error('successful_payment error:', e);
    await ctx.reply('⚠️ Оплата прошла, но не смогли обновить статус. Напишите в поддержку.');
  }
});

// Команды для пользователя
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

// Запуск бота
bot.launch();