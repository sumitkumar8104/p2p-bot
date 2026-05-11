# Message Templates CRUD API Documentation

**Base URL**: `http://localhost:3000/api/templates`

---

### 1. Create Template
**Endpoint**: `POST /`
**URL**: `http://localhost:3000/api/templates`

**Payload**:
```json
{
  "template_key": "greeting",
  "message_text": "Hello! How can I help you today?"
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "Template created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "template_key": "greeting"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Missing template_key or message_text",
  "data": null
}
```

---

### 2. Get All Templates
**Endpoint**: `GET /`
**URL**: `http://localhost:3000/api/templates`

**Payload**: `None`

**Success Response**:
```json
{
  "success": true,
  "message": "Templates retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "template_key": "greeting",
      "message_text": "Hello! How can I help you today?",
      "created_at": "2026-05-10T12:00:00.000Z",
      "updated_at": "2026-05-10T12:00:00.000Z"
    }
  ]
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Database connection failed",
  "data": null
}
```

---

### 3. Get Template by Key
**Endpoint**: `GET /:key`
**URL**: `http://localhost:3000/api/templates/greeting`

**Payload**: `None`

**Success Response**:
```json
{
  "success": true,
  "message": "Template retrieved successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "template_key": "greeting",
    "message_text": "Hello! How can I help you today?",
    "created_at": "2026-05-10T12:00:00.000Z",
    "updated_at": "2026-05-10T12:00:00.000Z"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Template not found",
  "data": null
}
```

---

### 4. Update Template
**Endpoint**: `PUT /:id`
**URL**: `http://localhost:3000/api/templates/550e8400-e29b-41d4-a716-446655440000`

**Payload**:
```json
{
  "template_key": "greeting_updated",
  "message_text": "Welcome! I am your automated assistant."
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "Template updated successfully",
  "data": null
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Template not found",
  "data": null
}
```

---

### 5. Delete Template
**Endpoint**: `DELETE /:id`
**URL**: `http://localhost:3000/api/templates/550e8400-e29b-41d4-a716-446655440000`

**Payload**: `None`

**Success Response**:
```json
{
  "success": true,
  "message": "Template deleted successfully",
  "data": null
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Template not found",
  "data": null
}
```

---

# Payouts API Documentation

**Base URL**: `http://localhost:3000/api/payouts`

---

### 1. Seed Payout Data
**Endpoint**: `POST /seed`
**Description**: Populates the `payouts` table with sample data for testing.

**Success Response**:
```json
{
  "success": true,
  "message": "Payout sample data seeded successfully",
  "data": null
}
```

---

### 2. Export Payouts to CSV
**Endpoint**: `GET /export`
**Description**: Fetches all payout records and downloads them as a CSV file.

**Success Response**:
*File Download: payouts_export_1715340000.csv*

---
