const { pool } = require("../config/mysql");
const ExcelJS = require("exceljs");

/**
 * Get all payouts
 */
const getPayouts = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payouts ORDER BY created_at ASC");
    
    // Map data to match the image requirements
    const formattedData = rows.map((row) => {
      const dateObj = new Date(row.created_at);
      const formattedDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear().toString().slice(-2)}`;
      
      return {
        id: row.id,
        date: formattedDate,
        name: row.pan_name,
        pan: row.seller_pan,
        amount: row.total_order_amount,
        tds_deducted: row.tds_amount,
        tds_deposited: row.tds_amount, 
        status: row.status,
      };
    });

    res.json({ 
      success: true, 
      message: "Payouts retrieved successfully", 
      data: formattedData 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message, 
      data: null 
    });
  }
};

/**
 * Seed sample payout data from Excel reference
 */
const seedPayouts = async (req, res) => {
  try {
    const sql = `
      INSERT INTO payouts (
          order_id, pan_name, seller_pan, total_order_amount, 
          tds_amount, amount, utr_number, status, created_at
      ) VALUES 
      ('P001', 'Devaraj', 'CRWPD9906K', 13200.00, 132.00, 13068.00, 'UTR001', 'SUCCESS', '2026-04-08 10:00:00'),
      ('P002', 'Devaraj', 'CRWPD9906K', 18900.00, 189.00, 18711.00, 'UTR002', 'SUCCESS', '2026-04-09 11:00:00'),
      ('P003', 'Devaraj', 'CRWPD9906K', 10000.00, 100.00, 9900.00, 'UTR003', 'SUCCESS', '2026-04-10 12:00:00'),
      ('P004', 'SELVARAJ', 'OCZPS8129H', 551994.48, 5519.94, 546474.54, 'UTR004', 'SUCCESS', '2026-04-15 13:00:00'),
      ('P005', 'Devaraj', 'CRWPD9906K', 10050.00, 100.50, 9949.50, 'UTR005', 'SUCCESS', '2026-04-16 14:00:00'),
      ('P006', 'Vadher', 'BBRPV1431K', 22994.48, 229.94, 22764.54, 'UTR006', 'SUCCESS', '2026-04-21 15:00:00'),
      ('P007', 'SUMIT MAHESHWARI', 'HXYPM9994P', 282094.54, 2820.95, 279273.59, 'UTR007', 'SUCCESS', '2026-04-23 16:00:00')
      ON DUPLICATE KEY UPDATE order_id=VALUES(order_id);
    `;

    await pool.query(sql);
    res.json({ success: true, message: "Payout sample data seeded successfully", data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

/**
 * Export payouts to Excel (.xlsx) in specific format
 */
const exportPayouts = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payouts ORDER BY created_at ASC");

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No data found to export", data: null });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Payouts");

    // Define columns
    worksheet.columns = [
      { header: "SR NO", key: "sr_no", width: 10 },
      { header: "Date", key: "date", width: 15 },
      { header: "NAME", key: "name", width: 30 },
      { header: "PAN", key: "pan", width: 20 },
      { header: "AMOUNT", key: "amount", width: 20 },
      { header: "1% TDS DEDUCTED", key: "tds_deducted", width: 20 },
      { header: "1% TDS DEPOSITED", key: "tds_deposited", width: 20 },
    ];

    // Add rows
    rows.forEach((row, index) => {
      const dateObj = new Date(row.created_at);
      const formattedDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear().toString().slice(-2)}`;
      
      worksheet.addRow({
        sr_no: index + 1,
        date: formattedDate,
        name: row.pan_name,
        pan: row.seller_pan,
        amount: parseFloat(row.total_order_amount).toFixed(2),
        tds_deducted: parseFloat(row.tds_amount).toFixed(2),
        tds_deposited: parseFloat(row.tds_amount).toFixed(2),
      });
    });

    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    
    // Borders
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    const filename = `payouts_export_${Date.now()}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Export error:", err.message);
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

module.exports = { getPayouts, seedPayouts, exportPayouts };
