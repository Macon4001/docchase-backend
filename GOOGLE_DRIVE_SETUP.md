# Google Drive OAuth Setup Guide

## Overview

This implementation allows each accountant to connect their own Google Drive account via OAuth. When documents are received from clients, they upload to that specific accountant's Drive using their stored tokens.

---

## 1. Google Cloud Console Setup (One-Time Setup)

### Step 1: Create a Project
1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Name: "Amy Document Assistant" (or your preferred name)
4. Click "Create"

### Step 2: Enable Google Drive API
1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

### Step 3: Create OAuth Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth Client ID"
3. If prompted, configure the OAuth consent screen first:
   - User Type: External (or Internal if using Google Workspace)
   - App name: "Amy Document Assistant"
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `../auth/drive.file` scope
   - Test users: Add your email for testing
4. Back to Create OAuth Client ID:
   - Application type: **Web application**
   - Name: "Amy App"
   - Authorized redirect URIs:
     - Development: `http://localhost:3001/api/settings/google-callback`
     - Production: `https://your-backend.railway.app/api/settings/google-callback`
5. Click "Create"
6. **Copy the Client ID and Client Secret** - you'll need these for your `.env` file

---

## 2. Environment Variables

Update your `.env` file with the credentials:

```env
# Google Drive OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/settings/google-callback

# Frontend URL for OAuth redirects
FRONTEND_URL=http://localhost:3000
```

**Production values:**
- `GOOGLE_REDIRECT_URI`: Your production backend URL + `/api/settings/google-callback`
- `FRONTEND_URL`: Your production frontend URL

---

## 3. Database Migration

Run the database migration to add the Google Drive columns:

```bash
cd docchase-backend
psql $DATABASE_URL -f migrations/002_add_google_drive_oauth.sql
```

This adds:
- `google_drive_token` (JSONB) - Stores access/refresh tokens
- `google_drive_folder_id` (VARCHAR) - Main "Amy Documents" folder ID
- `google_drive_connected_at` (TIMESTAMP) - Connection timestamp

---

## 4. API Endpoints

### Get Settings
```http
GET /api/settings
Authorization: Bearer {token}
```

Returns accountant's settings including Google Drive connection status.

### Get Google Auth URL
```http
GET /api/settings/google-auth
Authorization: Bearer {token}
```

Returns the OAuth URL to redirect the user to for authorization.

### Google OAuth Callback
```http
GET /api/settings/google-callback?code={code}&state={accountantId}
```

Handles the OAuth callback from Google. Exchanges code for tokens, creates "Amy Documents" folder, and stores everything in the database.

### Update Settings
```http
PUT /api/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "practiceName": "Smith & Co",
  "amyName": "Amy",
  "amyTone": "friendly",
  "notificationEmail": true,
  "notificationStuck": false
}
```

### Disconnect Google Drive
```http
DELETE /api/settings/google
Authorization: Bearer {token}
```

Removes Google Drive connection and tokens.

---

## 5. Frontend Integration Example

```typescript
// Fetch settings
const response = await fetch('/api/settings', {
  headers: { Authorization: `Bearer ${token}` }
});
const { settings } = await response.json();

if (settings.googleDriveConnected) {
  console.log('Connected since:', settings.googleDriveConnectedAt);
} else {
  // Show connect button
}

// Start OAuth flow
async function connectGoogleDrive() {
  const res = await fetch('/api/settings/google-auth', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const { authUrl } = await res.json();

  // Redirect to Google OAuth
  window.location.href = authUrl;
}

// After OAuth callback redirects back to /settings?google=connected
if (params.get('google') === 'connected') {
  // Show success message
}
```

---

## 6. How It Works

### OAuth Flow:
1. User clicks "Connect Google Drive" in settings
2. Frontend calls `GET /api/settings/google-auth`
3. Backend generates OAuth URL with accountant ID in state
4. User is redirected to Google consent screen
5. User approves access
6. Google redirects to `/api/settings/google-callback?code=xxx&state=accountantId`
7. Backend exchanges code for tokens
8. Backend creates "Amy Documents" folder in user's Drive
9. Backend stores tokens and folder ID in database
10. User is redirected back to frontend with success message

### Token Storage:
```json
{
  "access_token": "ya29.xxx",
  "refresh_token": "1//xxx",
  "scope": "https://www.googleapis.com/auth/drive.file",
  "token_type": "Bearer",
  "expiry_date": 1234567890000
}
```

### Token Refresh:
- Tokens are automatically refreshed when they expire (or within 5 minutes of expiry)
- The `refreshTokensIfNeeded()` function handles this transparently
- New tokens are saved back to the database

---

## 7. Using Google Drive Functions

```typescript
import {
  getAuthUrl,
  getTokensFromCode,
  getOrCreateAmyFolder,
  uploadToGoogleDrive,
  createClientFolder,
  refreshTokensIfNeeded,
  getAccountantTokens,
  disconnectGoogleDrive
} from './lib/google-drive.js';

// Get accountant's tokens from database
const data = await getAccountantTokens(accountantId);
if (!data) {
  throw new Error('Google Drive not connected');
}

let { tokens, folderId } = data;

// Refresh if needed
tokens = await refreshTokensIfNeeded(tokens);

// Upload a file
const file = await uploadToGoogleDrive(
  tokens,
  folderId,
  'client-statement.pdf',
  fileBuffer,
  'application/pdf'
);

console.log('Uploaded:', file.webViewLink);

// Create a client subfolder
const clientFolder = await createClientFolder(
  tokens,
  folderId,
  'John Doe'
);
```

---

## 8. Security Notes

- **Scope**: Uses `drive.file` scope - only allows access to files created by this app (more secure)
- **Tokens**: Stored encrypted in PostgreSQL JSONB column
- **Refresh Token**: Only obtained on first authorization (when `prompt=consent`)
- **Per-Accountant**: Each accountant has their own tokens - never shared
- **Revocation**: Users can revoke access anytime in Google Account settings

---

## 9. Testing Checklist

- [ ] Google Cloud project created
- [ ] Drive API enabled
- [ ] OAuth credentials created with correct redirect URI
- [ ] Environment variables set in `.env`
- [ ] Database migration run successfully
- [ ] `GET /api/settings` returns correct data
- [ ] `GET /api/settings/google-auth` returns valid OAuth URL
- [ ] Clicking OAuth URL redirects to Google consent screen
- [ ] After approving, redirected back with `google=connected`
- [ ] "Amy Documents" folder created in Google Drive
- [ ] Settings show `googleDriveConnected: true`
- [ ] Can upload a test file to the folder
- [ ] Tokens refresh automatically when expired
- [ ] `DELETE /api/settings/google` disconnects successfully
- [ ] Can reconnect after disconnecting

---

## 10. Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `redirect_uri_mismatch` | Callback URL doesn't match Google Console | Add exact URL to OAuth credentials authorized redirect URIs |
| `invalid_grant` | Code already used or expired | User needs to re-authorize |
| `Token has been revoked` | User revoked access in Google Account | Prompt to reconnect Google Drive |
| `insufficient_permission` | Wrong scope requested | Ensure using `drive.file` scope |
| `Google OAuth credentials not configured` | Missing env vars | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` |

---

## 11. Production Deployment

### Backend (Railway):
1. Add environment variables in Railway dashboard:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (use production URL)
   - `FRONTEND_URL` (your production frontend URL)

2. Update Google Cloud Console:
   - Add production redirect URI to OAuth credentials
   - Move OAuth consent screen from "Testing" to "In Production"

### Frontend (Vercel):
1. Ensure settings page handles OAuth callback query params
2. Update CORS allowed origins in backend if needed

---

## Support

For issues or questions:
- Check Google Cloud Console for API quotas
- Review OAuth consent screen settings
- Verify redirect URIs match exactly
- Check backend logs for detailed error messages
