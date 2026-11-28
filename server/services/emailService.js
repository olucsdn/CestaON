import nodemailer from 'nodemailer';

/**
 * Serviço de Envio de E-mails Transacionais do CestaON
 * Utiliza o Gmail SMTP (100% Gratuito - cota de até 500 envios/dia)
 * com fallback transparente para log em ambiente de desenvolvimento/testes.
 */

function getTransporter() {
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_SMTP) {
    return null;
  }

  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const rawPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const pass = rawPass ? rawPass.replace(/\s+/g, '') : '';

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: {
      user: user.trim(),
      pass: pass.trim()
    }
  });
}

/**
 * Envia código numérico de 6 dígitos para o e-mail do usuário
 * @param {string} toEmail 
 * @param {string} code 
 * @param {'register' | 'recover'} purpose 
 * @returns {Promise<{ success: boolean, simulated: boolean, method?: string, error?: string }>}
 */
export async function sendVerificationCodeEmail(toEmail, code, purpose = 'register') {
  const cleanEmail = String(toEmail).trim().toLowerCase();
  const senderUser = process.env.EMAIL_USER || process.env.SMTP_USER || '';

  const isRegister = purpose === 'register';
  const subject = isRegister
    ? 'CestaON — Seu Código de Confirmação de Cadastro'
    : 'CestaON — Código para Redefinição de Senha';

  const title = isRegister
    ? 'Confirmação de Cadastro'
    : 'Redefinição de Senha';

  const intro = isRegister
    ? 'Obrigado por se cadastrar no <strong>CestaON</strong>! Para ativar e confirmar sua conta, utilize o código de verificação abaixo:'
    : 'Recebemos uma solicitação para redefinir a senha da sua conta no <strong>CestaON</strong>. Utilize o código de verificação abaixo para continuar:';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 16px; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0f172a; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">
          Cesta<span style="color: #10b981;">On</span>
        </h1>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">No CestaON, o preço é bom.</p>
      </div>

      <div style="background-color: #ffffff; padding: 32px 24px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); text-align: center;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">${title}</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5; margin: 16px 0 24px 0;">${intro}</p>

        <div style="display: inline-block; background-color: #f0fdf4; border: 2px dashed #10b981; border-radius: 12px; padding: 16px 36px; margin: 8px 0 24px 0;">
          <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #047857; font-family: monospace;">${code}</span>
        </div>

        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Este código expira em <strong>15 minutos</strong>.</p>
        <p style="color: #94a3b8; font-size: 12px; margin: 6px 0 0 0;">Se você não solicitou este código, por favor ignore esta mensagem.</p>
      </div>

      <div style="text-align: center; margin-top: 24px; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} CestaON — Assistente Inteligente de Feiras e Supermercados.</p>
        <p style="margin: 4px 0 0 0;">100% Custo Zero & Privacidade Garantida.</p>
      </div>
    </div>
  `;

  const text = `${title}\n\nSeu código de verificação é: ${code}\n\nEste código é válido por 15 minutos.\n\nCestaON - No CestaON, o preço é bom.`;

  // 1. Canal Primário para Render Free: Google Apps Script Webhook (Porta 443 HTTPS - Sem Bloqueio)
  const webhookUrl = process.env.GMAIL_WEBHOOK_URL;
  if (webhookUrl && !process.env.TEST_SMTP) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, subject, message: text, html }),
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        return { success: true, simulated: false, method: 'google_webhook' };
      }
      const errText = await res.text().catch(() => '');
      console.warn('⚠️ [Webhook Warn] Falha ao despachar via Google Webhook:', errText);
    } catch (err) {
      console.warn('⚠️ [Webhook Error]:', err.message);
    }
  }

  // 2. Canal Alternativo: Brevo REST API (Porta 443 HTTPS - Sem Bloqueio do Render Free)
  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey && !process.env.TEST_SMTP && process.env.NODE_ENV !== 'test') {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'CestaON', email: senderUser },
          to: [{ email: cleanEmail }],
          subject,
          htmlContent: html,
          textContent: text
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        return { success: true, simulated: false, method: 'brevo' };
      }
      const errData = await res.json().catch(() => ({}));
      console.error('⚠️ [Brevo API Error]:', errData);
      return { success: false, simulated: false, error: errData.message || 'Falha ao despachar e-mail via Brevo API' };
    } catch (err) {
      console.error('⚠️ [Brevo Error]:', err.message);
      return { success: false, simulated: false, error: err.message };
    }
  }

  // 3. Fallback: SMTP Direto (Porta 465 SSL)
  const transporter = getTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n📧 [EMAIL MOCK] Para: ${cleanEmail} | Propósito: ${purpose} | Código: ${code}\n`);
    } else {
      console.log(`\n📧 [EMAIL MOCK] Para: ${cleanEmail} | Propósito: ${purpose} | Código: ******\n`);
    }
    return { success: true, simulated: true, method: 'mock' };
  }

  try {
    await transporter.sendMail({
      from: `"CestaON" <${senderUser}>`,
      to: cleanEmail,
      subject,
      text,
      html
    });
    return { success: true, simulated: false, method: 'smtp' };
  } catch (err) {
    console.error('⚠️ [EmailService Error] Falha ao enviar e-mail via SMTP:', err.message);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [EMAIL FALLBACK] Para: ${cleanEmail} | Código: ${code}`);
    }
    return {
      success: false,
      simulated: false,
      error: `Render Free bloqueia portas SMTP (25, 465, 587). Ative o webhook HTTPS do Gmail ou Brevo API: ${err.message}`
    };
  }
}
