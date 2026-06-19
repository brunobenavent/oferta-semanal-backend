import nodemailer from 'nodemailer';
import config from '../config/index.js';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

function buildHtmlContent({ titulo, textoBoton, url, mensajeExtra }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2d6a4f,#40916c);padding:30px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Oferta Semanal</h1>
              <p style="color:#d8f3dc;margin:8px 0 0 0;font-size:14px;">Viveros Guzmán</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#2d6a4f;margin:0 0 20px 0;font-size:20px;">${titulo}</h2>
              <p style="color:#333333;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                Hola, <strong>${'{{nombre}}'}</strong>:
              </p>
              <p style="color:#333333;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                ${'{{mensaje}}'}
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#2d6a4f,#40916c);border-radius:6px;">
                    <a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">${textoBoton}</a>
                  </td>
                </tr>
              </table>
              ${mensajeExtra ? `<p style="color:#666666;font-size:13px;text-align:center;margin:0 0 16px 0;">${mensajeExtra}</p>` : ''}
              <p style="color:#999999;font-size:12px;text-align:center;margin:16px 0 0 0;">
                Si no solicitaste este correo, ignóralo.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #e9ecef;">
              <p style="color:#666666;font-size:12px;margin:0;">© ${new Date().getFullYear()} Viveros Guzmán. Todos los derechos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.replace('{{nombre}}', '{nombre}').replace('{{mensaje}}', '{mensaje}');
}

function sendEmail({ to, subject, titulo, textoBoton, url, mensaje, mensajeExtra, nombre }) {
  const html = buildHtmlContent({ titulo, textoBoton, url, mensajeExtra })
    .replace('{nombre}', nombre || '')
    .replace('{mensaje}', mensaje);

  return transporter.sendMail({
    from: config.email.from,
    to,
    subject,
    html,
  });
}

export async function sendVerificationEmail(email, nombre, token) {
  try {
    const url = `${config.email.frontendUrl}/verify?token=${token}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email, nombre,
      subject: 'Verifica tu correo — Oferta Semanal',
      titulo: 'Verifica tu cuenta',
      textoBoton: 'Verificar mi correo',
      url,
      mensaje: `Gracias por registrarte en Oferta Semanal de Viveros Guzmán. Para completar tu registro, verifica tu dirección de correo haciendo clic en el botón:`,
      mensajeExtra: 'El enlace expirará en 24 horas.',
    });
    console.log(`[Email] Verification sent to ${email}`);
  } catch (error) {
    console.error(`[Email] Failed to send verification to ${email}:`, error.message);
  }
}

export async function sendPasswordResetEmail(email, nombre, token) {
  try {
    const url = `${config.email.frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email, nombre,
      subject: 'Restablece tu contraseña — Oferta Semanal',
      titulo: 'Restablecer contraseña',
      textoBoton: 'Restablecer contraseña',
      url,
      mensaje: `Recibimos una solicitud para restablecer la contraseña de tu cuenta en Oferta Semanal. Si fuiste tú, haz clic en el botón para crear una nueva contraseña:`,
      mensajeExtra: 'El enlace expirará en 1 hora.',
    });
    console.log(`[Email] Password reset sent to ${email}`);
  } catch (error) {
    console.error(`[Email] Failed to send password reset to ${email}:`, error.message);
  }
}

export async function sendInviteEmail(email, nombre, token) {
  try {
    const url = `${config.email.frontendUrl}/verify?token=${token}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email, nombre,
      subject: 'Has sido invitado a Oferta Semanal',
      titulo: 'Bienvenido a Oferta Semanal',
      textoBoton: 'Verificar mi correo',
      url,
      mensaje: `Te han dado de alta en Oferta Semanal de Viveros Guzmán. Para acceder, primero verifica tu correo haciendo clic en el botón. Después, inicia sesión y usa "¿Olvidaste tu contraseña?" para establecer tu contraseña.`,
      mensajeExtra: 'El enlace expirará en 24 horas.',
    });
    console.log(`[Email] Invite sent to ${email}`);
  } catch (error) {
    console.error(`[Email] Failed to send invite to ${email}:`, error.message);
  }
}

export async function sendPreorderNotification(preorder) {
  try {
    if (!config.email.user || !config.email.pass) {
      console.warn('[Email] Skipping preorder notification — email not configured');
      return;
    }

    const clienteNombre = preorder.cliente?.nombre || preorder.cliente?.clientName || preorder.cliente?.email || 'Cliente';
    const frontendUrl = config.email.frontendUrl;
    const numItems = preorder.items?.length || 0;

    const itemsRows = (preorder.items || []).map(item => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #dee2e6;">${item.codigoArticulo}</td>
        <td style="padding:6px 10px;border:1px solid #dee2e6;">${item.descripcionArticulo || ''}</td>
        <td style="padding:6px 10px;border:1px solid #dee2e6;text-align:right;">${item.unidades}</td>
        <td style="padding:6px 10px;border:1px solid #dee2e6;text-align:right;">${item.karrys}</td>
        <td style="padding:6px 10px;border:1px solid #dee2e6;text-align:right;">${item.tablas}</td>
      </tr>`).join('');

    const subject = `Nuevo pedido de ${clienteNombre}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#2d6a4f,#40916c);padding:30px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Nuevo Pedido Recibido</h1>
              <p style="color:#d8f3dc;margin:8px 0 0 0;font-size:14px;">Viveros Guzmán</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="color:#333333;font-size:15px;line-height:1.6;margin:0 0 8px 0;">
                <strong>Cliente:</strong> ${clienteNombre}
              </p>
              <p style="color:#333333;font-size:15px;line-height:1.6;margin:0 0 8px 0;">
                <strong>Artículos:</strong> ${numItems}
              </p>
              ${numItems > 0 ? `
              <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;">
                <thead>
                  <tr style="background-color:#f1f3f5;">
                    <th style="padding:6px 10px;border:1px solid #dee2e6;text-align:left;font-size:13px;">Código</th>
                    <th style="padding:6px 10px;border:1px solid #dee2e6;text-align:left;font-size:13px;">Descripción</th>
                    <th style="padding:6px 10px;border:1px solid #dee2e6;text-align:right;font-size:13px;">Unidades</th>
                    <th style="padding:6px 10px;border:1px solid #dee2e6;text-align:right;font-size:13px;">Karrys</th>
                    <th style="padding:6px 10px;border:1px solid #dee2e6;text-align:right;font-size:13px;">Tablas</th>
                  </tr>
                </thead>
                <tbody>${itemsRows}</tbody>
              </table>
              ` : ''}
              <table cellpadding="0" cellspacing="0" style="margin:24px auto 0 auto;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#2d6a4f,#40916c);border-radius:6px;">
                    <a href="${frontendUrl}/pedidos" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Ver Pedidos</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #e9ecef;">
              <p style="color:#666666;font-size:12px;margin:0;">© ${new Date().getFullYear()} Viveros Guzmán. Todos los derechos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    for (const comercial of preorder.comerciales) {
      await transporter.sendMail({
        from: config.email.from,
        to: comercial.email,
        subject,
        html,
      });
    }

    console.log(`[Email] Preorder notification sent for preorder ${preorder._id}`);
  } catch (error) {
    console.error(`[Email] Failed to send preorder notification:`, error.message);
  }
}
