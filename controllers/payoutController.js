const { pool } = require("../config/mysql");
const { Parser } = require("json2csv");

/**
 * Seed sample payout data
 */
const seedPayouts = async (req, res) => {
  try {
    const sql = `
      INSERT INTO payouts (
          order_id, pan_name, seller_pan, total_order_amount, 
          tds_amount, amount, utr_number, status, created_at
      ) VALUES 
      ('ORD9901', 'Rajesh Kumar', 'ABCDE1234F', 10000.00, 100.00, 9900.00, 'UTR772101', 'SUCCESS', '2026-05-01 10:30:00'),
      ('ORD9902', 'Anita Sharma', 'FGHIJ5678K', 5500.00, 55.00, 5445.00, 'UTR772102', 'SUCCESS', '2026-05-02 11:15:00'),
      ('ORD9903', 'Vikram Singh', 'KLMNO9012L', 12000.00, 120.00, 11880.00, 'UTR772103', 'SUCCESS', '2026-05-03 14:05:00'),
      ('ORD9904', 'Suresh Raina', 'PQRST3456M', 800.00, 8.00, 792.00, 'UTR772104', 'SUCCESS', '2026-05-04 09:45:00'),
      ('ORD9905', 'Meena Gupta', 'UVWXY7890N', 25000.00, 250.00, 24750.00, 'UTR772105', 'SUCCESS', '2026-05-05 16:20:00'),
      ('ORD9906', 'Arjun Verma', 'ZABCD1234P', 1500.00, 15.00, 1485.00, 'UTR772106', 'SUCCESS', '2026-05-06 10:10:00'),
      ('ORD9907', 'Priya Patel', 'EFGHI5678Q', 4200.00, 42.00, 4158.00, 'UTR772107', 'SUCCESS', '2026-05-07 13:40:00'),
      ('ORD9908', 'Rahul Dravid', 'JKLMN9012R', 9500.00, 95.00, 9405.00, 'UTR772108', 'SUCCESS', '2026-05-08 15:55:00'),
      ('ORD9909', 'Sonia Gandhi', 'OPQRS3456S', 18000.00, 180.00, 17820.00, 'UTR772109', 'SUCCESS', '2026-05-09 11:30:00'),
      ('ORD9910', 'Amit Shah', 'TUVWX7890T', 3000.00, 30.00, 2970.00, 'UTR772110', 'SUCCESS', '2026-05-10 17:05:00'),
      ('ORD9911', 'Deepak Chahar', 'ABCDE4321F', 7200.00, 72.00, 7128.00, 'UTR772111', 'SUCCESS', '2026-05-11 08:20:00'),
      ('ORD9912', 'Kavita Iyer', 'FGHIJ8765K', 1100.00, 11.00, 1089.00, 'UTR772112', 'SUCCESS', '2026-05-12 12:45:00'),
      ('ORD9913', 'Mohit Sharma', 'KLMNO2109L', 6600.00, 66.00, 6534.00, 'UTR772113', 'SUCCESS', '2026-05-13 14:15:00'),
      ('ORD9914', 'Pooja Hegde', 'PQRST6543M', 20000.00, 200.00, 19800.00, 'UTR772114', 'SUCCESS', '2026-05-14 10:00:00'),
      ('ORD9915', 'Rohan Bopanna', 'UVWXY0987N', 4500.00, 45.00, 4455.00, 'UTR772115', 'SUCCESS', '2026-05-15 11:20:00'),
      ('ORD9916', 'Ishant Sharma', 'ZABCD4321P', 13500.00, 135.00, 13365.00, 'UTR772116', 'SUCCESS', '2026-05-16 13:50:00'),
      ('ORD9917', 'Shikhar Dhawan', 'EFGHI8765Q', 2200.00, 22.00, 2178.00, 'UTR772117', 'SUCCESS', '2026-05-17 15:10:00'),
      ('ORD9918', 'Hardik Pandya', 'JKLMN2109R', 31000.00, 310.00, 30690.00, 'UTR772118', 'SUCCESS', '2026-05-18 16:30:00'),
      ('ORD9919', 'Jasprit Bumrah', 'OPQRS6543S', 1400.00, 14.00, 1386.00, 'UTR772119', 'SUCCESS', '2026-05-19 10:45:00'),
      ('ORD9920', 'KL Rahul', 'TUVWX0987T', 8800.00, 88.00, 8712.00, 'UTR772120', 'SUCCESS', '2026-05-20 12:00:00')
      ON DUPLICATE KEY UPDATE order_id=VALUES(order_id);
    `;

    await pool.query(sql);
    res.json({ success: true, message: "Payout sample data seeded successfully", data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

/**
 * Export payouts to CSV
 */
const exportPayouts = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payouts ORDER BY created_at DESC");

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No data found to export", data: null });
    }

    const fields = [
      "id", "order_id", "pan_name", "seller_pan", 
      "total_order_amount", "tds_amount", "amount", 
      "utr_number", "status", "created_at"
    ];
    
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(rows);

    const filename = `payouts_export_${Date.now()}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

module.exports = { seedPayouts, exportPayouts };
