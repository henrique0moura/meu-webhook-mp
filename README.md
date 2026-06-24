# Webhook Externo — Mercado Pago → Base44

Este serviço recebe notificações do Mercado Pago e ativa assinaturas automaticamente na Base44.

## Arquitetura

```
Usuário paga no MP
    ↓
MP envia webhook → https://SEU-DOMINIO/api/webhook
    ↓
Webhook consulta API do MP (valida pagamento)
    ↓
Se approved → login no Base44 (admin) → ativa assinatura
    ↓
Frontend detecta (polling) → redireciona para /dashboard
```

## Deploy (Vercel)

1. **Crie um repositório no GitHub** com a pasta `external-webhook/`
2. Importe em https://vercel.com
3. Configure as variáveis de ambiente:

| Variável | Descrição |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token do MP (painel do MP → Credenciais) |
| `BASE44_APP_ID` | ID do app Base44 (pegue na URL do editor: `base44.com/app/{APP_ID}`) |
| `BASE44_ADMIN_EMAIL` | Email do seu admin no GestorArq |
| `BASE44_ADMIN_PASSWORD` | Senha do admin |
| `WEBHOOK_URL` | `https://SEU-DOMINIO.vercel.app/api/webhook` (a URL após o deploy) |

4. Deploy

## Configurar no Mercado Pago

1. Painel do MP → **Webhooks** (ou Notificações)
2. URL: `https://SEU-DOMINIO.vercel.app/api/webhook`
3. Eventos: selecione **Payment**
4. Salvar

## Configurar no Frontend (GestorArq)

No arquivo `src/lib/app-params.js`, adicione:

```javascript
export const EXTERNAL_WEBHOOK_URL = "https://SEU-DOMINIO.vercel.app";
```

A página `PaymentPending.jsx` já está preparada para chamar `/api/create-preference` e redirecionar para o checkout do MP.

## Endpoints

### POST /api/create-preference
Cria uma preferência de pagamento com `external_reference` e `notification_url`.

**Body:**
```json
{ "user_id": "abc123", "plan": "monthly", "user_email": "...", "user_name": "..." }
```

**Response:**
```json
{ "init_point": "https://www.mercadopago.com.br/checkout/...", "preference_id": "...", "external_reference": "abc123-monthly" }
```

### POST /api/webhook
Recebe notificações do MP. Não precisa ser chamado manualmente.

## Segurança

- ✅ Access Token do MP fica apenas no servidor (variável de ambiente)
- ✅ Credenciais do Base44 admin ficam apenas no servidor
- ✅ Webhook valida o pagamento consultando a API do MP (não confia no payload)
- ✅ Previne ativação duplicada (verifica `mp_payment_id`)
- ✅ Ignora eventos não relacionados a pagamento
- ✅ Log de auditoria para todos os eventos