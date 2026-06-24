/**
 * Webhook do Mercado Pago – recebe notificações e ativa assinaturas no Base44
 */

/* global process */
const MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

const PLAN_DURATIONS = {
  monthly: 30,
  semiannual: 180,
  annual: 365,
};

module.exports = async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method !== "POST") {
    console.log(`[MP Webhook] Rejected ${req.method}`, { timestamp });
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};

  if (body.type !== "payment") {
    console.log(`[MP Webhook] Ignored non-payment event`, { type: body.type, timestamp });
    return res.status(200).json({ status: "ignored", message: "Non-payment event" });
  }

  const paymentId = body?.data?.id;
  if (!paymentId) {
    console.error(`[MP Webhook] No payment_id`, { body, timestamp });
    return res.status(400).json({ error: "Missing payment_id" });
  }

  console.log(`[MP Webhook] Notification received`, { payment_id: paymentId, timestamp });

  let paymentInfo;
  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    paymentInfo = await mpRes.json();
  } catch (e) {
    console.error(`[MP Webhook] Failed to query MP API`, { payment_id: paymentId, error: e.message, timestamp });
    return res.status(502).json({ error: "Failed to verify payment" });
  }

  if (!paymentInfo || !paymentInfo.id) {
    console.error(`[MP Webhook] Invalid MP API response`, { payment_id: paymentId, response: paymentInfo, timestamp });
    return res.status(502).json({ error: "Could not verify payment" });
  }

  const status = paymentInfo.status;
  const externalReference = paymentInfo.external_reference;

  console.log(`[MP Webhook] Payment details`, {
    payment_id: paymentId,
    status,
    external_reference: externalReference,
    timestamp,
  });

  if (!externalReference) {
    console.error(`[MP Webhook] No external_reference`, { payment_id: paymentId, timestamp });
    return res.status(400).json({ error: "Missing external_reference" });
  }

  const parts = externalReference.split("-");
  if (parts.length < 2) {
    console.error(`[MP Webhook] Invalid external_reference format`, { external_reference: externalReference, timestamp });
    return res.status(400).json({ error: "Invalid external_reference" });
  }

  const plan = parts[parts.length - 1];
  const userId = parts.slice(0, -1).join("-");

  const { createClient } = await import("@base44/sdk");

  const base44 = createClient({
    appId: process.env.BASE44_APP_ID,
  });

  try {
    await base44.auth.loginViaEmailPassword(
      process.env.BASE44_ADMIN_EMAIL,
      process.env.BASE44_ADMIN_PASSWORD
    );
  } catch (e) {
    console.error(`[MP Webhook] Base44 login failed`, { error: e.message, timestamp });
    return res.status(500).json({ error: "Auth failed" });
  }

  try {
    await base44.entities.AuditLog.create({
      event_type: "admin_action",
      details: `MP Webhook: payment_id=${paymentId}, status=${status}, external_ref=${externalReference}, plan=${plan}, ts=${timestamp}`,
    });
  } catch (e) {
    console.error(`[MP Webhook] Failed to create audit log`, { error: e.message });
  }

  if (status !== "approved") {
    console.log(`[MP Webhook] Not approved — no activation`, { payment_id: paymentId, status, timestamp });
    return res.status(200).json({ status: "logged", payment_status: status });
  }

  let sub;
  try {
    const subs = await base44.entities.Subscription.filter({ user_id: userId });
    sub = subs?.[0];
  } catch (e) {
    console.error(`[MP Webhook] Failed to find subscription`, { user_id: userId, error: e.message, timestamp });
    return res.status(500).json({ error: "Failed to find subscription" });
  }

  if (!sub) {
    console.error(`[MP Webhook] Subscription not found`, { user_id: userId, timestamp });
    return res.status(404).json({ error: "Subscription not found" });
  }

  if (sub.status === "active" && sub.mp_payment_id === Number(paymentId)) {
    console.log(`[MP Webhook] Already processed`, { payment_id: paymentId, timestamp });
    return res.status(200).json({ status: "already_processed" });
  }

  const days = PLAN_DURATIONS[plan] || PLAN_DURATIONS[sub.plan] || 30;
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + days);
  const todayStr = new Date().toISOString().split("T")[0];

  try {
    await base44.entities.Subscription.update(sub.id, {
      status: "active",
      payment_status: "approved",
      plan: plan,
      mp_payment_id: Number(paymentId),
      mp_external_reference: externalReference,
      expiration_date: expDate.toISOString().split("T")[0],
      contracted_date: todayStr,
    });

    await base44.entities.AuditLog.create({
      event_type: "payment_approved",
      target_user_id: userId,
      target_user_email: sub.user_email,
      details: `Pagamento aprovado via MP — payment_id=${paymentId}, plano=${plan}, ativo até ${expDate.toISOString().split("T")[0]}`,
    });

    console.log(`[MP Webhook] ✓ Activated`, { user_id: userId, plan, payment_id: paymentId, timestamp });
    return res.status(200).json({ status: "activated", user_id: userId, plan });
  } catch (e) {
    console.error(`[MP Webhook] Activation error`, { error: e.message, timestamp });
    return res.status(500).json({ error: "Activation failed" });
  }
};