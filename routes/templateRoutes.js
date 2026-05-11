const express = require("express");
const router = express.Router();
const {
  createTemplate,
  getTemplates,
  getTemplateByKey,
  updateTemplate,
  deleteTemplate
} = require("../controllers/templateController");

router.post("/", createTemplate);
router.get("/", getTemplates);
router.get("/:key", getTemplateByKey);
router.put("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);

module.exports = router;
