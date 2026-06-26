import express from 'express';
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer-core';

const PORT = process.env.PORT || 3000;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const SHARED_SECRET = process.env.SHARED_SECRET || '';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

function criarTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

async function renderizarHtmlParaPdf(documentHtml) {
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        protocolTimeout: 120000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--no-zygote'
        ]
    });
    try {
        const page = await browser.newPage();
        await page.setContent(String(documentHtml), { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.emulateMediaType('print');
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' }
        });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

app.get('/', (req, res) => res.status(200).json({ ok: true, service: 'render-pdf' }));

app.post('/api/send-pdf', async (req, res) => {
    if (SHARED_SECRET && req.headers['x-app-secret'] !== SHARED_SECRET) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    try {
        const { to, subject, html, filename, documentHtml, pdfBase64 } = req.body || {};
        if (!filename) {
            return res.status(400).json({ error: 'missing_fields', need: ['filename', 'documentHtml'] });
        }

        let pdfBuffer;
        if (documentHtml) {
            pdfBuffer = await renderizarHtmlParaPdf(documentHtml);
        } else if (pdfBase64) {
            pdfBuffer = Buffer.from(String(pdfBase64).replace(/^data:.*;base64,/, ''), 'base64');
        } else {
            return res.status(400).json({ error: 'missing_fields', need: ['documentHtml'] });
        }

        const nomeArquivo = /\.pdf$/i.test(String(filename)) ? String(filename) : String(filename) + '.pdf';

        let messageId = null;
        if (to) {
            const info = await criarTransporter().sendMail({
                from: MAIL_FROM,
                to: Array.isArray(to) ? to.join(',') : to,
                subject: String(subject || 'Documento'),
                html: html || '<p>Segue o documento em anexo.</p>',
                attachments: [{ filename: nomeArquivo, content: pdfBuffer }]
            });
            messageId = info.messageId;
        }

        return res.status(200).json({ ok: true, id: messageId, pdfBase64: pdfBuffer.toString('base64') });
    } catch (e) {
        return res.status(500).json({ error: 'server_error', detail: String((e && e.message) || e) });
    }
});

app.listen(PORT, () => console.log('render-pdf ouvindo na porta ' + PORT));
