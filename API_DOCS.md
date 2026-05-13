# P2P Bot API Documentation

## 🔐 Authentication API
**Base URL**: `http://localhost:3000/api/auth`

---

### 1. Admin Login
**Endpoint**: `POST /login`
**Description**: Authenticate admin and receive a JWT token.

**Payload**:
```json
{
  "email": "admin@gmail.com",
  "password": "Admin@12345"
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "JWT_TOKEN_HERE",
    "user": {
      "id": 1,
      "email": "admin@gmail.com",
      "role": "admin"
    }
  }
}
```

**Error Response (Multi-device prevention)**:
```json
{
  "success": false,
  "message": "You need to logout from other device where you are logged in",
  "data": null
}
```

---

### 2. Admin Logout
**Endpoint**: `POST /logout`
**Header**: `Authorization: Bearer <token>`
**Description**: Invalidates the current session by setting `is_login` to `false`.

**Success Response**:
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

---

### 3. Change Password
**Endpoint**: `POST /change-password`
**Header**: `Authorization: Bearer <token>`
**Description**: Updates the authenticated user's password.

**Payload**:
```json
{
  "oldPassword": "Admin@12345",
  "newPassword": "NewSecurePassword@2026"
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "Password updated successfully",
  "data": null
}
```

---

## 📝 Message Templates API (Requires Auth)
**Base URL**: `http://localhost:3000/api/templates`
**Header**: `Authorization: Bearer <token>`

---

### 1. Create Template / Add Messages (Bulk)
**Endpoint**: `POST /`
**Description**: Creates a template group if it doesn't exist, and adds multiple messages to it in one request.
**Validation**: Duplicate `step_order` for the same `template_key` is NOT allowed.

**Payload**:
```json
{
  "template_key": "kyc_flow",
  "messages": [
    { 
      "message_text": "Please provide your PAN number.", 
      "step_order": 1 
    },
    { 
      "message_text": "Now verifying your PAN details...", 
      "step_order": 2 
    }
  ]
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "Template messages added successfully",
  "data": {
    "template_key": "kyc_flow",
    "addedMessages": [
      { "id": 1, "step_order": 1 },
      { "id": 2, "step_order": 2 }
    ]
  }
}
```

**Error Response (Duplicate Step)**:
```json
{
  "success": false,
  "message": "Step order 1 is already created for this template key",
  "data": null
}
```

---

### 2. Get All Templates
**Endpoint**: `GET /`
**Description**: Retrieves all template keys along with their associated messages.

**Success Response**:
```json
{
  "success": true,
  "message": "Templates retrieved successfully",
  "data": [
    {
      "id": 1,
      "template_key": "kyc_flow",
      "messages": [
        { "id": 1, "message_text": "...", "step_order": 1 },
        { "id": 2, "message_text": "...", "step_order": 2 }
      ]
    }
  ]
}
```

---

### 3. Get Template messages by Key
**Endpoint**: `GET /:key`
**URL Example**: `/api/templates/kyc_flow`

**Success Response**:
```json
{
  "success": true,
  "message": "Template messages retrieved successfully",
  "data": {
    "template_key": "kyc_flow",
    "messages": [
      { "id": 1, "message_text": "...", "step_order": 1 },
      { "id": 2, "message_text": "...", "step_order": 2 }
    ]
  }
}
```

---

### 4. Update Template Messages (Bulk/Reorder)
**Endpoint**: `PUT /`
**Description**: Updates multiple messages within a template group at once. Ideal for reordering steps or batch editing text.

**Payload**:
```json
{
  "template_key": "kyc_flow",
  "messages": [
    { 
      "id": 1, 
      "message_text": "Please provide your PAN number.", 
      "step_order": 1 
    },
    { 
      "id": 2, 
      "message_text": "Thank you. Now verifying...", 
      "step_order": 2 
    }
  ]
}
```

**Success Response**:
```json
{
  "success": true,
  "message": "Template messages updated successfully",
  "data": null
}
```

---

### 5. Delete Template Message
**Endpoint**: `DELETE /:id`
**Description**: Deletes a specific message from a template.

---

### 6. Delete Template Group
**Endpoint**: `DELETE /group/:id`
**Description**: Deletes an entire template key and all its associated messages.

---

## 💰 Payouts API (Requires Auth)
**Base URL**: `http://localhost:3000/api/payouts`
**Header**: `Authorization: Bearer <token>`

---

### 1. Get All Payouts
**Endpoint**: `GET /`
**Description**: Retrieves all payout records.

**Success Response**:
```json
{
  "success": true,
  "message": "Payouts retrieved successfully",
  "data": [
    {
      "id": 1,
      "sr_no": 1,
      "date": "8/4/26",
      "name": "Devaraj",
      "pan": "CRWPD9906K",
      "amount": 13200.00,
      "tds_deducted": 132.00,
      "tds_deposited": 132.00,
      "utr_number": "UTR001",
      "status": "SUCCESS",
      "created_at": "2026-04-08T10:00:00.000Z"
    }
  ]
}
```

---

### 2. Seed Payout Data
**Endpoint**: `POST /seed`
**Description**: Populates the database with sample data matching the reference Excel file.

---

### 3. Export Payouts to Excel
**Endpoint**: `GET /export`
**Description**: Fetches all payout records and downloads them as a styled `.xlsx` Excel file.
**Columns**: `SR NO`, `Date`, `NAME`, `PAN`, `AMOUNT`, `1% TDS DEDUCTED`, `1% TDS DEPOSITED`.

**Success Response**:
*File Download: payouts_export_1715340000.xlsx*

---

## 📊 Admin Dashboard API (Requires Auth)
**Base URL**: `http://localhost:3000/api/admin`
**Header**: `Authorization: Bearer <token>`

---

## 🤖 Bot Configuration API (Requires Auth)
**Base URL**: `http://localhost:3000/api/bot-config`
**Header**: `Authorization: Bearer <token>`

---
