import { Telegraf, Markup } from "telegraf";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// ====== Конфиг ======
const token = process.env.BOT_TOKEN;
const DOMAIN = process.env.DOMAIN;
const PORT = process.env.PORT || 3000;
const webAppUrl = "https://pincoinbot.web.app";

// ====== Supabase ======
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ====== Инициализация ======
const bot = new Telegraf(token);
const app = express();
app.use(cors({ origin: webAppUrl }));
app.use(express.json());

// ====== Утилита: создать invoice ======
async function createBoostInvoice() {
  return await bot.telegram.createInvoiceLink({
    title: "Boost",
    description: "Activate Boost (Unlimited)",
    payload: "boost_payload",
    provider_token: "", // Stars → пустая строка
    currency: "XTR",
    prices: [{ label: "Boost", amount: 100 }], // 1 Star
  });
}

async function createEnergyInvoice() {
  return await bot.telegram.createInvoiceLink({
    title: "Energy Boost",
    description: "Increase your energy in the app",
    payload: "energy_payload",
    provider_token: "", // Stars
    currency: "XTR",
    prices: [{ label: "Energy Boost", amount: 1 }], // 0.5 ⭐️
  });
}

// ====== Команды бота ======
bot.start(async (ctx) => {
  try {
    const tgId = ctx.from.id;
    const name = ctx.from.first_name || "User";
    let ref = ctx.startPayload ? parseInt(ctx.startPayload) : null;
    if (isNaN(ref)) ref = null;

    // Проверяем, есть ли пользователь в базе
    const { data: existingUser, error: selectError } = await supabase
      .from("users")
      .select("*")
      .eq("telegram", tgId)
      .single();

    if (selectError && selectError.code !== "PGRST116") {
      console.error("Supabase select error:", selectError);
    }

    // Если есть рефка и пригласивший существует, обновляем friends
    if (ref && ref !== tgId) {
      try {
        const { data: inviter, error: inviterError } = await supabase
          .from("users")
          .select("friends")
          .eq("telegram", ref)
          .single();

        if (!inviterError && inviter) {
          const friends = inviter.friends || {};
          // Добавляем нового друга с дополнительным полем rewarded = false
          friends[tgId] = {
            name,
            rewarded: false,
          };

          const { error: updateError } = await supabase
            .from("users")
            .update({ friends }) // без score
            .eq("telegram", ref);

          if (updateError)
            console.error("Ошибка обновления friends:", updateError);
        }
      } catch (e) {
        console.error("Ошибка при добавлении в friends:", e);
      }
    }

    // Отправляем кнопку открытия приложения с реферальным параметром
    const refParam = ref ? `?ref=${ref}` : "";
    return ctx.reply(
      "Welcome to Pincoin!",
      Markup.inlineKeyboard([
        Markup.button.webApp("Open App", `${webAppUrl}${refParam}`),
      ])
    );
  } catch (e) {
    console.error("Ошибка в bot.start:", e);
    return ctx.reply("❌ Ошибка при запуске. Попробуй ещё раз.");
  }
});

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

// Ручная проверка → получаем ссылку на оплату
bot.command("sendstars", async (ctx) => {
  try {
    const invoice = await createBoostInvoice();
    await ctx.reply(`👉 Оплатить Boost: ${invoice}`);
  } catch (e) {
    console.error("sendstars error:", e);
    ctx.reply("❌ Не удалось создать счёт");
  }
});

// ✅ Обработка pre_checkout_query (обязательно для Stars)
bot.on("pre_checkout_query", async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (e) {
    console.error("pre_checkout_query error:", e);
  }
});

// ✅ Успешная оплата
bot.on("successful_payment", async (ctx) => {
  try {
    const tgId = ctx.from.id;
    const payload = ctx.update.message?.successful_payment?.invoice_payload;

    if (!payload) return;

    // === Донат ⭐️ ===
    if (payload.startsWith("donate_")) {
      // Получаем текущее значение donate и увеличиваем на 1
      const { data, error: selectError } = await supabase
        .from("users")
        .select("donate")
        .eq("telegram", tgId)
        .single();

      if (selectError) {
        console.error("Select error (donate):", selectError);
        return;
      }

      const newDonate = (data.donate || 0) + 1;

      const { error: updateError } = await supabase
        .from("users")
        .update({ donate: newDonate })
        .eq("telegram", tgId);

      if (updateError) console.error("Update error (donate):", updateError);

      return;
    }

    // Energy Boost
    if (payload === "energy_payload") {
      const { error } = await supabase
        .from("users")
        .update({ clicker_energy: 1000 }) // фиксированное значение
        .eq("telegram", tgId);

      if (error) console.error("Supabase error (energy update):", error);
      return;
    }

    // === Boost ===
    if (payload === "boost_payload") {
      const { error } = await supabase
        .from("users")
        .update({ boost: true })
        .eq("telegram", tgId);

      if (error) console.error("Supabase error (boost update):", error);
      return;
    }
    if (payload.startsWith("streak_restore_")) {
      const parts = payload.split("_")
      const daysMissed = parseInt(parts[2])
      const currentStreak = parseInt(parts[3])
      const newStreak = currentStreak + daysMissed + 1

      await supabase
        .from("users")
        .update({
          checkin_streak: newStreak,
          last_checkin_at: new Date().toISOString()
        })
        .eq("telegram", tgId);

      return;
    }
  } catch (e) {
    console.error("successful_payment handler error:", e);
  }
});

app.get("/boost-status/:tgId", async (req, res) => {
  const tgId = req.params.tgId;
  const { data } = await supabase
    .from("users")
    .select("boost")
    .eq("telegram", tgId)
    .single();

  res.json({ boost: data?.boost || false });
});

app.post("/create-donate-invoice", async (req, res) => {
  try {
    const { telegramId } = req.body;

    const invoice = await bot.telegram.createInvoiceLink({
      title: "Donate",
      description: "Make a donation to support the project",
      payload: `donate_${telegramId}_${Date.now()}`,
      provider_token: "", // Stars
      currency: "XTR",
      prices: [{ label: "Donate", amount: 50 }], // 1 ⭐️
    });

    res.json({ invoiceLink: invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ====== Webhook ======
const WEBHOOK_PATH = `/webhook/${token}`;
const WEBHOOK_URL = `${DOMAIN}${WEBHOOK_PATH}`;

app.post(WEBHOOK_PATH, (req, res) => {
  res.sendStatus(200);
  bot.handleUpdate(req.body).catch(console.error);
});

// ====== Endpoint для MiniApp (создание инвойса) ======
app.post("/create-invoice", async (req, res) => {
  try {
    const invoice = await createBoostInvoice();
    res.json({ invoiceLink: invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/create-energy-invoice", async (req, res) => {
  try {
    const invoice = await createEnergyInvoice();
    res.json({ invoiceLink: invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/create-streak-invoice", async (req, res) => {
  try {
    const { daysMissed, currentStreak } = req.body  // добавили currentStreak
    const amount = daysMissed * 10

    const invoice = await bot.telegram.createInvoiceLink({
      title: "Restore Streak",
      description: `Restore your ${daysMissed} missed days`,
      payload: `streak_restore_${daysMissed}_${currentStreak}`,  // добавили
      provider_token: "",
      currency: "XTR",
      prices: [{ label: "Restore Streak", amount }],
    });

    res.json({ invoiceLink: invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => res.send("PincoinBot API running"));

// ====== Запуск ======
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await bot.telegram.setWebhook(WEBHOOK_URL);
  console.log(`Webhook установлен: ${WEBHOOK_URL}`);
});
