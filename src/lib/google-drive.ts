import { google } from 'googleapis';
import { Readable } from 'stream';
import { db } from './db.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/settings/google-callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('⚠️ Google Drive credentials not configured');
}

// Type for Google OAuth tokens
export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

/**
 * Create OAuth2 client with app credentials
 */
function getOAuthClient() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/**
 * Generate the Google OAuth URL for user to authorize
 * @param state - Optional state parameter (e.g., accountant ID)
 * @returns The authorization URL
 */
export function getAuthUrl(state: string = ''): string {
  const oauth2Client = getOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',        // Gets refresh_token
    prompt: 'consent',             // Forces consent screen (ensures refresh_token)
    scope: [
      'https://www.googleapis.com/auth/drive.file'  // Only files created by app
    ],
    state: state                   // Pass accountant ID to callback
  });
}

/**
 * Exchange authorization code for tokens
 * @param code - The code from Google callback
 * @returns The tokens object
 */
export async function getTokensFromCode(code: string): Promise<GoogleTokens> {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens as GoogleTokens;
}

/**
 * Refresh access token if expired
 * @param tokens - The stored tokens object
 * @returns Updated tokens
 */
export async function refreshTokensIfNeeded(tokens: GoogleTokens): Promise<GoogleTokens> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  // Check if token is expired or will expire in next 5 minutes
  const expiryDate = tokens.expiry_date;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiryDate && expiryDate - now < fiveMinutes) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials as GoogleTokens;
  }

  return tokens;
}

/**
 * Upload a file to Google Drive
 * @param tokens - The accountant's Google tokens
 * @param folderId - The folder ID to upload to (optional)
 * @param filename - Name for the file
 * @param buffer - The file content
 * @param mimeType - The file MIME type
 * @returns The created file metadata
 */
export async function uploadToGoogleDrive(
  tokens: GoogleTokens,
  folderId: string | null,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ id: string; name: string; webViewLink: string; mimeType: string; size: string }> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Convert buffer to readable stream
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const requestBody: any = {
    name: filename,
  };

  // Add to folder if specified
  if (folderId) {
    requestBody.parents = [folderId];
  }

  const response = await drive.files.create({
    requestBody,
    media: {
      mimeType: mimeType,
      body: stream
    },
    fields: 'id, name, webViewLink, mimeType, size'
  });

  return response.data as any;
}

/**
 * Create a folder in Google Drive
 * @param tokens - The accountant's Google tokens
 * @param folderName - Name for the folder
 * @param parentFolderId - Parent folder ID (optional)
 * @returns The created folder metadata
 */
export async function createFolder(
  tokens: GoogleTokens,
  folderName: string,
  parentFolderId: string | null = null
): Promise<{ id: string; name: string; webViewLink: string }> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const requestBody: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentFolderId) {
    requestBody.parents = [parentFolderId];
  }

  const response = await drive.files.create({
    requestBody,
    fields: 'id, name, webViewLink'
  });

  return response.data as any;
}

/**
 * Create a subfolder for a specific client
 * @param tokens - The accountant's Google tokens
 * @param parentFolderId - The main Amy folder ID
 * @param clientName - The client's name
 * @returns The created folder metadata
 */
export async function createClientFolder(
  tokens: GoogleTokens,
  parentFolderId: string,
  clientName: string
): Promise<{ id: string; name: string; webViewLink: string }> {
  // Sanitize client name for folder
  const safeName = clientName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return createFolder(tokens, safeName, parentFolderId);
}

/**
 * Get or create the main Amy folder
 * @param tokens - The accountant's Google tokens
 * @returns The folder metadata
 */
export async function getOrCreateAmyFolder(tokens: GoogleTokens): Promise<{ id: string; name: string; webViewLink: string }> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Search for existing Amy folder
  const response = await drive.files.list({
    q: "name = 'Amy Documents' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive'
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0] as any;
  }

  // Create if doesn't exist
  return createFolder(tokens, 'Amy Documents');
}

/**
 * Store Google tokens for an accountant
 * @param accountantId - The accountant's ID
 * @param tokens - The Google OAuth tokens
 * @param folderId - The main Amy folder ID
 */
export async function storeGoogleTokens(
  accountantId: string,
  tokens: GoogleTokens,
  folderId: string
): Promise<void> {
  await db.query(
    `UPDATE accountants
     SET google_drive_token = $1,
         google_drive_folder_id = $2,
         google_drive_connected_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [JSON.stringify(tokens), folderId, accountantId]
  );

  console.log(`✅ Stored Google tokens for accountant ${accountantId}`);
}

/**
 * Get accountant's Google tokens from database
 * @param accountantId - The accountant's ID
 * @returns The tokens and folder ID
 */
export async function getAccountantTokens(
  accountantId: string
): Promise<{ tokens: GoogleTokens; folderId: string | null } | null> {
  const result = await db.query<{
    google_drive_token: any;
    google_drive_folder_id: string | null;
  }>(
    `SELECT google_drive_token, google_drive_folder_id
     FROM accountants
     WHERE id = $1`,
    [accountantId]
  );

  if (result.rows.length === 0 || !result.rows[0].google_drive_token) {
    return null;
  }

  const { google_drive_token, google_drive_folder_id } = result.rows[0];

  return {
    tokens: typeof google_drive_token === 'string'
      ? JSON.parse(google_drive_token)
      : google_drive_token,
    folderId: google_drive_folder_id
  };
}

/**
 * Disconnect Google Drive for an accountant
 * @param accountantId - The accountant's ID
 */
export async function disconnectGoogleDrive(accountantId: string): Promise<void> {
  await db.query(
    `UPDATE accountants
     SET google_drive_token = NULL,
         google_drive_folder_id = NULL,
         google_drive_connected_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [accountantId]
  );

  console.log(`✅ Disconnected Google Drive for accountant ${accountantId}`);
}

/**
 * Upload a file from a URL to Google Drive (for campaign documents)
 * Downloads the file from Twilio and uploads it to the accountant's Google Drive
 */
export async function uploadCampaignDocument(
  accountantId: string,
  campaignId: string,
  campaignName: string,
  clientName: string,
  fileUrl: string,
  fileType: string,
  documentId: string
): Promise<{ driveFileId: string; driveFileUrl: string }> {
  // Get accountant's Google tokens
  const accountantData = await getAccountantTokens(accountantId);

  if (!accountantData) {
    throw new Error('Google Drive not connected for this accountant. Please connect Google Drive first.');
  }

  const { tokens, folderId } = accountantData;

  if (!folderId) {
    throw new Error('Google Drive folder not configured. Please reconnect Google Drive.');
  }

  // Refresh tokens if needed
  const freshTokens = await refreshTokensIfNeeded(tokens);

  // If tokens were refreshed, save them
  if (freshTokens !== tokens) {
    await storeGoogleTokens(accountantId, freshTokens, folderId);
  }

  // Download the file from Twilio URL
  const axios = (await import('axios')).default;

  // Twilio requires authentication for media URLs
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

  if (!twilioAccountSid || !twilioAuthToken) {
    throw new Error('Twilio credentials not configured');
  }

  console.log(`📥 Downloading file from Twilio: ${fileUrl}`);

  const response = await axios.get(fileUrl, {
    auth: {
      username: twilioAccountSid,
      password: twilioAuthToken
    },
    responseType: 'arraybuffer'
  });

  const fileBuffer = Buffer.from(response.data);

  // Extract filename from document or generate one
  const documentResult = await db.query<{ id: string }>(
    `SELECT id FROM documents WHERE id = $1`,
    [documentId]
  );

  if (documentResult.rows.length === 0) {
    throw new Error('Document not found in database');
  }

  // Generate a safe filename
  const safeClientName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
  const safeCampaignName = campaignName.replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const extension = fileType.includes('pdf') ? 'pdf' : fileType.includes('image') ? 'jpg' : 'file';
  const filename = `${safeClientName}_${safeCampaignName}_${timestamp}.${extension}`;

  // Get or create client subfolder
  const clientFolderData = await createClientFolder(freshTokens, folderId, clientName);

  console.log(`📁 Uploading to Google Drive folder: ${clientFolderData.name}`);

  // Upload file to Google Drive
  const uploadResult = await uploadToGoogleDrive(
    freshTokens,
    clientFolderData.id,
    filename,
    fileBuffer,
    fileType
  );

  console.log(`✅ File uploaded to Google Drive: ${uploadResult.webViewLink}`);

  // Update document record with Google Drive info
  await db.query(
    `UPDATE documents
     SET drive_file_id = $1,
         drive_file_url = $2
     WHERE id = $3`,
    [uploadResult.id, uploadResult.webViewLink, documentId]
  );

  return {
    driveFileId: uploadResult.id,
    driveFileUrl: uploadResult.webViewLink
  };
}
