const { pool } = require("../config/mysql");
const { v4: uuidv4 } = require("uuid");

// Create Template
const createTemplate = async (req, res) => {
  try {
    const { template_key, message_text } = req.body;
    if (!template_key || !message_text) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing template_key or message_text",
        data: null 
      });
    }

    const id = uuidv4();
    await pool.query(
      "INSERT INTO message_templates (id, template_key, message_text) VALUES (?, ?, ?)",
      [id, template_key, message_text]
    );

    res.status(201).json({ 
      success: true, 
      message: "Template created successfully",
      data: { id, template_key } 
    });
  } catch (err) {
    console.error("❌ Failed to create template:", err.message);
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Get All Templates
const getTemplates = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM message_templates ORDER BY created_at DESC");
    res.json({ 
      success: true, 
      message: "Templates retrieved successfully",
      data: rows 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Get Single Template
const getTemplateByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const [rows] = await pool.query("SELECT * FROM message_templates WHERE template_key = ?", [key]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Template not found",
        data: null 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Template retrieved successfully",
      data: rows[0] 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Update Template
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { template_key, message_text } = req.body;

    const [result] = await pool.query(
      "UPDATE message_templates SET template_key = ?, message_text = ? WHERE id = ?",
      [template_key, message_text, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Template not found",
        data: null 
      });
    }

    res.json({ 
      success: true, 
      message: "Template updated successfully",
      data: null 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Delete Template
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query("DELETE FROM message_templates WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Template not found",
        data: null 
      });
    }

    res.json({ 
      success: true, 
      message: "Template deleted successfully",
      data: null 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

module.exports = {
  createTemplate,
  getTemplates,
  getTemplateByKey,
  updateTemplate,
  deleteTemplate
};
