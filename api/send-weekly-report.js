// /api/send-weekly-report.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// HTML-escaping för säkerhet
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Samma typ av formatTid som i frontend, men separat här
function formatTid(minuter) {
  const m = Number(minuter) || 0;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(rest).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Om Vercel inte har parsat body automatiskt
async function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const body =
      req.body && Object.keys(req.body).length ? req.body : await getJsonBody(req);

    const { vecka, år, filterText, mottagare, rader } = body || {};

    if (!vecka || !år || !Array.isArray(rader)) {
      res.status(400).send("Ogiltig request body");
      return;
    }

    const toEmail = mottagare || process.env.EMAIL_TO_DEFAULT;
    if (!toEmail) {
      res.status(500).send("Ingen mottagare angiven (EMAIL_TO_DEFAULT saknas)");
      return;
    }

    const fromEmail = process.env.EMAIL_FROM;
    if (!fromEmail) {
      res.status(500).send("EMAIL_FROM saknas i miljövariabler");
      return;
    }

    // Bygg HTML-rader för tabellen
    const htmlRows = rader
      .map((r) => {
        const adress = escapeHtml(r.adress);
        const antalJobb = Number(r.antalJobb) || 0;
        const tidMinuter = Number(r.tidMinuter) || 0;
        const grusKg = Number(r.grusKg) || 0;
        const saltKg = Number(r.saltKg) || 0;

        return `
          <tr>
            <td style="padding:6px 8px;border:1px solid #ddd;">${adress}</td>
            <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${antalJobb}</td>
            <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${formatTid(
              tidMinuter
            )}</td>
            <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${grusKg}</td>
            <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${saltKg}</td>
          </tr>
        `;
      })
      .join("");

    // Totalsummering
    const totalJobb = rader.reduce(
      (sum, r) => sum + (Number(r.antalJobb) || 0),
      0
    );
    const totalTidMin = rader.reduce(
      (sum, r) => sum + (Number(r.tidMinuter) || 0),
      0
    );
    const totalGrus = rader.reduce(
      (sum, r) => sum + (Number(r.grusKg) || 0),
      0
    );
    const totalSalt = rader.reduce(
      (sum, r) => sum + (Number(r.saltKg) || 0),
      0
    );

    const totalRadHtml = `
      <tr style="background:#f9f9f9;font-weight:bold;">
        <td style="padding:6px 8px;border:1px solid #ddd;">TOTALT</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${totalJobb}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${formatTid(
          totalTidMin
        )}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${totalGrus}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">${totalSalt}</td>
      </tr>
    `;

    const html = `
      <div style="font-family:Arial, sans-serif; font-size:14px; color:#333;">
        <h2 style="margin-bottom:4px;">Veckorapport SnöJour</h2>
        <div style="margin-bottom:12px; color:#555;">
          <div><strong>Vecka:</strong> ${vecka}</div>
          <div><strong>År:</strong> ${år}</div>
          <div><strong>Filter:</strong> ${escapeHtml(filterText || "")}</div>
        </div>

        <table style="border-collapse:collapse; width:100%; max-width:900px;">
          <thead>
            <tr style="background:#f2f2f2;">
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Adress</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:center;">Antal jobb</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Tid (hh:mm)</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Grus (kg)</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Salt (kg)</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
            ${totalRadHtml}
          </tbody>
        </table>

        <div style="margin-top:16px;">
          Vänliga hälsningar,<br />
          <strong>SnöJour-systemet</strong>
        </div>
      </div>
    `;

    const subject = `Veckorapport SnöJour v${vecka} ${år}`;

    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    res.status(200).send("OK");
  } catch (err) {
    console.error("Fel i send-weekly-report:", err);
    res.status(500).send("Server error: " + err.message);
  }
}
