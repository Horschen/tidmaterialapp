import { createClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  // koppla Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // hämta senaste veckan (exempel)
  const { data } = await supabase
    .from("rapporter")
    .select("datum, arbetstid_min, adresser(namn), sand_kg, salt_kg, team_namn")
    .limit(1000);

  // skapa PDF
  const doc = new PDFDocument();
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.fontSize(18).text("Veckorapport SnöJour", { align: "center" }).moveDown();

  data.forEach((r) => {
    doc.fontSize(10).text(
      `${new Date(r.datum).toLocaleDateString()}  |  ${r.adresser?.namn}  |  ${r.team_namn}  |  ${r.arbetstid_min} min  | Grus:${r.sand_kg} | Salt:${r.salt_kg}`
    );
  });
  doc.end();
  const pdfBuffer = Buffer.concat(chunks);

  // skickar via Gmail/SendGrid
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });

  await transporter.sendMail({
    from: '"SnöJour‑Rapport" <no-reply@snojour.se>',
    to: "hakan@…, lollo@…, jimmy@…",
    subject: "Rapport SnöJour",
    text: "Hej! Här kommer rapporten som PDF.",
    attachments: [{ filename: "rapport.pdf", content: pdfBuffer }],
  });

  res.status(200).json({ ok: true });
}
