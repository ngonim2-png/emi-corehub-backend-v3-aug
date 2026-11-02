import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import * as fs from 'fs';
import * as path from 'path';

const NAVY = '#0B0827';
const GOLD = '#AD8F3B';
const GREY = '#5B6B7C';

function money(n: number): string {
  return 'NLe ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A premium statement PDF: policy summary + every premium received, with the outstanding balance. */
@Injectable()
export class AppStatementService {
  private logoPath(): string | null {
    const candidates = [
      path.join(process.cwd(), 'public', 'client-app', 'img', 'logo-full.png'),
      path.join(__dirname, '..', '..', '..', 'public', 'client-app', 'img', 'logo-full.png'),
    ];
    return candidates.find((p) => fs.existsSync(p)) ?? null;
  }

  async build(client: { fullName: string; clientNo: string }, policy: any): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 46, info: { Title: `Premium statement ${policy.policyNo}`, Author: 'Enhanced Mutual Insurance (SL) Ltd' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const logo = this.logoPath();
    if (logo) doc.image(logo, 46, 40, { width: 190 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text('PREMIUM STATEMENT', 300, 46, { width: 250, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(GREY).text(`Generated ${new Date().toISOString().slice(0, 10)}`, 300, 68, { width: 250, align: 'right' });
    doc.moveTo(46, 100).lineTo(549, 100).lineWidth(1.5).strokeColor(GOLD).stroke();

    let y = 116;
    const row = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(9.5).fillColor(GREY).text(label, 46, y, { width: 150 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(value || '-', 200, y, { width: 340 });
      y += 17;
    };
    row('Policyholder', client.fullName);
    row('Client number', client.clientNo);
    row('Policy number', policy.policyNo);
    row('Product', policy.productName);
    if (policy.insuredName) row('Life assured', policy.insuredName);
    row('Status', policy.status);
    row('Sum assured', money(policy.sumAssured));
    row('Monthly premium', money(policy.monthlyPremium));
    row('Commenced', policy.commencementDate);
    if (policy.maturityDate) row('Matures', policy.maturityDate);

    y += 6;
    doc.roundedRect(46, y, 503, 54, 6).fillColor('#F4F6F8').fill();
    const box = (x: number, label: string, val: string, color = NAVY) => {
      doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(label, x, y + 10, { width: 160 });
      doc.font('Helvetica-Bold').fontSize(13).fillColor(color).text(val, x, y + 26, { width: 160 });
    };
    box(60, 'TOTAL EXPECTED TO DATE', money(policy.totalExpected));
    box(228, 'TOTAL PAID', money(policy.totalPaid), '#1E7145');
    box(396, 'OUTSTANDING', money(policy.totalOutstanding), policy.totalOutstanding > 0 ? '#B3261E' : '#1E7145');
    y += 74;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Premiums received', 46, y);
    y += 20;
    const cols = [46, 120, 200, 320, 440];
    const head = () => {
      doc.rect(46, y - 3, 503, 18).fillColor(NAVY).fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
      ['Date received', 'Month covered', 'Receipt no.', 'Method', 'Amount'].forEach((h, i) => doc.text(h, cols[i] + 4, y + 2, { width: 110 }));
      y += 20;
    };
    head();
    const payments: any[] = policy.payments ?? [];
    if (payments.length === 0) {
      doc.font('Helvetica').fontSize(9.5).fillColor(GREY).text('No premiums have been recorded yet.', 50, y + 4);
      y += 24;
    }
    let shade = false;
    for (const p of payments) {
      if (y > 770) {
        doc.addPage();
        y = 50;
        head();
      }
      if (shade) doc.rect(46, y - 3, 503, 16).fillColor('#F8F9FA').fill();
      shade = !shade;
      doc.font('Helvetica').fontSize(9).fillColor('#182633');
      doc.text(p.date, cols[0] + 4, y, { width: 70 });
      doc.text(p.paymentMonth, cols[1] + 4, y, { width: 75 });
      doc.text(p.receiptNo ?? '', cols[2] + 4, y, { width: 115 });
      doc.text(p.method ?? '', cols[3] + 4, y, { width: 115 });
      doc.text(money(p.amount), cols[4] + 4, y, { width: 100 });
      y += 16;
    }
    doc.font('Helvetica').fontSize(8).fillColor(GREY).text(
      'This statement lists premiums recorded on our system at the date shown. If anything looks wrong, please contact the office with your policy number.',
      46, Math.min(y + 18, 790), { width: 503 },
    );
    doc.end();
    return done;
  }
}
