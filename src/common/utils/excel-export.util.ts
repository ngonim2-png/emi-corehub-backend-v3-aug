import * as ExcelJS from 'exceljs';

const NAVY = 'FF0B0827';
const WHITE_TEXT = 'FFFFFFFF';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  /** For money/number columns - applies a right-aligned, fixed-2-decimal display without changing the underlying value. */
  numeric?: boolean;
}

/**
 * One shared builder behind every "Download (Excel)" button in the app -
 * same header styling, same auto-sized columns, same behavior - rather
 * than each section hand-rolling its own worksheet. Takes plain rows
 * (arrays of field values matching the column keys) so callers don't
 * need to know anything about ExcelJS.
 */
export async function buildExcelExport(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, string | number | null>[],
  title?: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EMI CoreHub';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31)); // Excel's own 31-char sheet name limit

  let headerRowIndex = 1;
  if (title) {
    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 13 };
    headerRowIndex = 3;
  }

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));

  const headerRow = sheet.getRow(headerRowIndex);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: WHITE_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle' };
  });
  headerRow.commit();

  rows.forEach((row, i) => {
    const excelRow = sheet.getRow(headerRowIndex + 1 + i);
    columns.forEach((c, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1);
      cell.value = row[c.key] ?? '';
      if (c.numeric && typeof row[c.key] === 'number') cell.numFmt = '#,##0.00';
    });
    if (i % 2 === 1) {
      excelRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F8' } };
      });
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
