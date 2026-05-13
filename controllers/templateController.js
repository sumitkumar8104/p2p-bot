const { pool } = require("../config/mysql");
const { v4: uuidv4 } = require("uuid");

// Create Template / Add Messages to Template (Bulk)
const createTemplate = async (req, res) => {
  try {
    const { template_key, small_description, sort_order, messages } = req.body;

    if (!template_key || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing template_key or messages array",
        data: null
      });
    }

    // 1. Get or Create Template Group
    let [groups] = await pool.query("SELECT id FROM template_groups WHERE template_key = ?", [template_key]);
    let groupId;
    let resolvedSortOrder;

    if (groups.length === 0) {
      // Auto-assign sort_order to MAX+1 when not provided, so new keys append to the end
      if (sort_order === undefined || sort_order === null) {
        const [[{ next_order }]] = await pool.query(
          "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM template_groups"
        );
        resolvedSortOrder = next_order;
      } else {
        resolvedSortOrder = sort_order;
      }

      const [result] = await pool.query(
        "INSERT INTO template_groups (template_key, small_description, sort_order) VALUES (?, ?, ?)",
        [template_key, small_description || null, resolvedSortOrder]
      );
      groupId = result.insertId;
    } else {
      groupId = groups[0].id;
      // If caller passed updates for description/order on an existing group, apply them
      if (small_description !== undefined) {
        await pool.query(
          "UPDATE template_groups SET small_description = ? WHERE id = ?",
          [small_description, groupId]
        );
      }
      if (sort_order !== undefined) {
        await pool.query(
          "UPDATE template_groups SET sort_order = ? WHERE id = ?",
          [sort_order, groupId]
        );
      }
    }

    // 2. Add Messages in a transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const addedMessages = [];
      for (const msg of messages) {
        if (!msg.message_text || msg.step_order === undefined) {
          throw new Error("Each message must have message_text and step_order");
        }

        // Validation: Check if step_order already exists for this group
        const [existingStep] = await connection.query(
          "SELECT id FROM template_messages WHERE template_id = ? AND step_order = ?",
          [groupId, msg.step_order]
        );

        if (existingStep.length > 0) {
          throw new Error(`Step order ${msg.step_order} is already created for this template key`);
        }

        const [msgResult] = await connection.query(
          "INSERT INTO template_messages (template_id, message_text, step_order) VALUES (?, ?, ?)",
          [groupId, msg.message_text, msg.step_order]
        );
        
        addedMessages.push({ id: msgResult.insertId, step_order: msg.step_order });
      }

      await connection.commit();
      
      res.status(201).json({
        success: true,
        message: "Template messages added successfully",
        data: {
          template_key,
          small_description: small_description ?? null,
          sort_order: resolvedSortOrder ?? sort_order ?? null,
          addedMessages
        }
      });
    } catch (err) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: err.message,
        data: null
      });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ Failed to create templates:", err.message);
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Get All Template Groups
const getTemplates = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT g.id as group_id, g.template_key, g.small_description, g.sort_order, m.id as message_id, m.message_text, m.step_order
      FROM template_groups g
      LEFT JOIN template_messages m ON g.id = m.template_id
      ORDER BY g.sort_order ASC, g.template_key ASC, m.step_order ASC
    `);

    // Format results into groups
    const templates = rows.reduce((acc, row) => {
      let group = acc.find(g => g.template_key === row.template_key);
      if (!group) {
        group = {
          id: row.group_id,
          template_key: row.template_key,
          small_description: row.small_description,
          sort_order: row.sort_order,
          messages: []
        };
        acc.push(group);
      }
      if (row.message_id) {
        group.messages.push({
          id: row.message_id,
          message_text: row.message_text,
          step_order: row.step_order
        });
      }
      return acc;
    }, []);

    res.json({ 
      success: true, 
      message: "Templates retrieved successfully",
      data: templates 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Get Single Template by Key (Returns all messages for that key)
const getTemplateByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const [rows] = await pool.query(`
      SELECT g.template_key, g.small_description, g.sort_order, m.id, m.message_text, m.step_order
      FROM template_groups g
      LEFT JOIN template_messages m ON g.id = m.template_id
      WHERE g.template_key = ?
      ORDER BY m.step_order ASC
    `, [key]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
        data: null
      });
    }

    const messages = rows
      .filter(r => r.id !== null)
      .map(r => ({ id: r.id, message_text: r.message_text, step_order: r.step_order }));

    res.json({
      success: true,
      message: "Template messages retrieved successfully",
      data: {
        template_key: rows[0].template_key,
        small_description: rows[0].small_description,
        sort_order: rows[0].sort_order,
        messages
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Update Template Messages (Bulk Update for Reordering/Editing)
const updateTemplate = async (req, res) => {
  try {
    const { template_key, small_description, sort_order, messages } = req.body;

    if (!template_key || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        message: "Missing template_key or messages array",
        data: null
      });
    }

    // 1. Get Template Group ID
    const [groups] = await pool.query("SELECT id FROM template_groups WHERE template_key = ?", [template_key]);
    if (groups.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Template key not found",
        data: null
      });
    }
    const groupId = groups[0].id;

    // 2. Perform updates in a transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update group-level fields if provided
      if (small_description !== undefined) {
        await connection.query(
          "UPDATE template_groups SET small_description = ? WHERE id = ?",
          [small_description, groupId]
        );
      }
      if (sort_order !== undefined) {
        await connection.query(
          "UPDATE template_groups SET sort_order = ? WHERE id = ?",
          [sort_order, groupId]
        );
      }

      for (const msg of messages) {
        if (!msg.id || !msg.message_text || msg.step_order === undefined) {
          throw new Error("Each message must have id, message_text, and step_order");
        }
        
        await connection.query(
          "UPDATE template_messages SET message_text = ?, step_order = ? WHERE id = ? AND template_id = ?",
          [msg.message_text, msg.step_order, msg.id, groupId]
        );
      }
      await connection.commit();
      
      res.json({ 
        success: true, 
        message: "Template messages updated successfully",
        data: null 
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ Failed to update templates:", err.message);
    res.status(500).json({ 
      success: false, 
      message: err.message,
      data: null 
    });
  }
};

// Delete Template Message
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params; // message_id
    const [result] = await pool.query("DELETE FROM template_messages WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Template message not found",
        data: null 
      });
    }

    res.json({ 
      success: true, 
      message: "Template message deleted successfully",
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

// Delete Template Group (and all its messages)
const deleteTemplateGroup = async (req, res) => {
    try {
      const { id } = req.params; // group_id
      const [result] = await pool.query("DELETE FROM template_groups WHERE id = ?", [id]);
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Template group not found",
          data: null 
        });
      }
  
      res.json({ 
        success: true, 
        message: "Template group and all messages deleted successfully",
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
  deleteTemplate,
  deleteTemplateGroup
};
