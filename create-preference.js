/**
 * Cria uma preferência de pagamento no Mercado Pago com external_reference
 * e notification_url configurados. O frontend chama este endpoint antes de
 * redirecionar o usuário para o checkout.
 *
 * POST /api/create-preference
 * Body: { user_id, plan, user_email, user_name }
 * Response: { init_point, preference_id, external_reference }
 */

/* global process */
const MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

const PLANS = {
  monthly: { title: "Plano Mensal — GestorArq", price: 30 },
  semiannual: { title: "Plano Semestral — GestorArq", price: 150 },
  annual: { title: "Plano Anual — GestorArq", price: 200 },
};

// ⚠️ Substitua pela sua URL de produção após o deploy
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://SEU-DOMINIO.vercel.app/api/webhook";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user_id, plan, user_email, user_name } = req.body || {};

  if (!user_id || !plan) {
    return res.status(400).json({ error: "Missing user_id or plan" });
  }

  const planConfig = PLANS[plan];
  if (!planConfig) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  const externalReference = `${user_id}-${plan}`;

  const preferenceData = {
    items: [{
      id: plan,
      title: planConfig.title,
      quantity: 1,
      unit_price: planConfig.price,
      currency_id: "BRL",
    }],
    external_reference: externalReference,
    payer: {
      email: user_email || undefined,
      name: user_name || undefined,
    },
    back_urls: {
      success: `${req.headers.origin}/payment-pending`,
      pending: `${req.headers.origin}/payment-pending`,
      failure: `${req.headers.origin}/payment-pending`,
    },
    auto_return: "approved",
    notification_url: WEBHOOK_URL,
    statement_descriptor: "GESTORARQ",
  };

  try {
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preferenceData),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("[Create Preference] MP error", mpData);
      return res.status(502).json({ error: "MP API error", details: mpData.message });
    }

    return res.status(200).json({
      init_point: mpData.init_point,
      preference_id: mpData.id,
      external_reference: externalReference,
    });
  } catch (e) {
    console.error("[Create Preference] Exception", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
};