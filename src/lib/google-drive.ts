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
 * Get or create the root "GettingDocs" folder
 * @param tokens - The accountant's Google tokens
 * @returns The folder metadata
 */
export async function getOrCreateRootFolder(tokens: GoogleTokens): Promise<{ id: string; name: string; webViewLink: string }> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Search for existing GettingDocs folder
  const response = await drive.files.list({
    q: "name = 'GettingDocs' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive'
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0] as any;
  }

  // Create if doesn't exist
  console.log('📁 Creating GettingDocs root folder...');
  return createFolder(tokens, 'GettingDocs');
}

/**
 * Get or create a client folder with phone suffix
 * Format: {Client Name} ({last 7 digits of phone})
 * Example: John Smith (7700123)
 *
 * @param tokens - The accountant's Google tokens
 * @param rootFolderId - The GettingDocs folder ID
 * @param clientName - The client's name
 * @param clientPhone - The client's phone number
 * @returns The folder metadata
 */
export async function getOrCreateClientFolder(
  tokens: GoogleTokens,
  rootFolderId: string,
  clientName: string,
  clientPhone: string
): Promise<{ id: string; name: string; webViewLink: string }> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Generate folder name with phone suffix (last 7 digits)
  const phoneSuffix = clientPhone.slice(-7);
  const sanitizedName = clientName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  const folderName = `${sanitizedName} (${phoneSuffix})`;

  // Search for existing folder
  const escapedFolderName = folderName.replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `name = '${escapedFolderName}' and '${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive'
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0] as any;
  }

  // Create if doesn't exist
  console.log(`📁 Creating client folder: ${folderName}`);
  return createFolder(tokens, folderName, rootFolderId);
}

/**
 * Generate document filename based on naming convention
 * Format: {Document_Type}_{Period}_{Year}.{extension}
 * Example: Bank_Statement_January_2026.pdf
 *
 * @param documentType - Type of document (e.g., "Bank Statement")
 * @param period - Period (e.g., "January", "Q1", or empty string)
 * @param year - Year (e.g., "2026")
 * @param extension - File extension (e.g., "pdf", "csv")
 * @returns The formatted filename
 */
export function generateDocumentFilename(
  documentType: string,
  period: string,
  year: string,
  extension: string
): string {
  // Sanitize document type (replace spaces with underscores, remove special chars)
  const sanitizedType = documentType
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '_');

  // Sanitize period (if provided)
  const sanitizedPeriod = period
    ? period.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
    : '';

  // Build filename
  if (sanitizedPeriod) {
    return `${sanitizedType}_${sanitizedPeriod}_${year}.${extension}`;
  } else {
    return `${sanitizedType}_${year}.${extension}`;
  }
}

/**
 * Check if a file exists in a folder
 * @param tokens - The accountant's Google tokens
 * @param folderId - The folder ID to check in
 * @param filename - The filename to check
 * @returns True if file exists, false otherwise
 */
async function checkFileExists(
  tokens: GoogleTokens,
  folderId: string,
  filename: string
): Promise<boolean> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const escapedFilename = filename.replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `name = '${escapedFilename}' and '${folderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  return !!(response.data.files && response.data.files.length > 0);
}

/**
 * Generate a unique filename by appending timestamp if duplicate exists
 * @param tokens - The accountant's Google tokens
 * @param folderId - The folder ID to check in
 * @param baseFilename - The base filename
 * @returns The unique filename
 */
async function generateUniqueFilename(
  tokens: GoogleTokens,
  folderId: string,
  baseFilename: string
): Promise<string> {
  // Check if file already exists
  const exists = await checkFileExists(tokens, folderId, baseFilename);

  if (!exists) {
    return baseFilename;
  }

  // Append timestamp to make unique
  const timestamp = Date.now();
  const lastDotIndex = baseFilename.lastIndexOf('.');

  if (lastDotIndex === -1) {
    // No extension
    return `${baseFilename}_${timestamp}`;
  }

  const nameWithoutExt = baseFilename.substring(0, lastDotIndex);
  const ext = baseFilename.substring(lastDotIndex + 1);

  return `${nameWithoutExt}_${timestamp}.${ext}`;
}

/**
 * Store Google tokens for an accountant
 * @param accountantId - The accountant's ID
 * @param tokens - The Google OAuth tokens
 * @param folderId - The GettingDocs folder ID
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
 * Upload a campaign document to Google Drive using the GettingDocs structure
 *
 * Structure:
 *   GettingDocs/
 *   └── John Smith (7700123)/
 *       ├── Bank_Statement_January_2026.pdf
 *       └── Bank_Statement_January_2026.csv
 *
 * @param accountantId - The accountant's ID
 * @param campaignId - The campaign ID
 * @param documentType - Type of document (e.g., "Bank Statement")
 * @param period - Period (e.g., "January", "Q1")
 * @param year - Year (e.g., "2026")
 * @param clientName - The client's name
 * @param clientPhone - The client's phone number
 * @param fileUrl - URL to download the file from (Twilio)
 * @param fileType - MIME type of the file
 * @param documentId - The document ID in database
 * @returns File upload result
 */
export async function uploadCampaignDocument(
  accountantId: string,
  _campaignId: string,
  documentType: string,
  period: string,
  year: string,
  clientName: string,
  clientPhone: string,
  fileUrl: string,
  fileType: string,
  documentId: string
): Promise<{ driveFileId: string; driveFileUrl: string; driveFileName: string }> {
  // 1. Get accountant's Google tokens
  const accountantData = await getAccountantTokens(accountantId);

  if (!accountantData) {
    throw new Error('Google Drive not connected for this accountant. Please connect Google Drive first.');
  }

  let { tokens, folderId } = accountantData;

  // 2. Refresh tokens if needed
  const freshTokens = await refreshTokensIfNeeded(tokens);

  // If tokens were refreshed, update them
  if (freshTokens !== tokens) {
    tokens = freshTokens;
  }

  // 3. Get or create root GettingDocs folder
  if (!folderId) {
    console.log('📁 No GettingDocs folder found, creating one...');
    const rootFolder = await getOrCreateRootFolder(freshTokens);
    folderId = rootFolder.id;
    console.log(`✅ GettingDocs folder ready: ${rootFolder.webViewLink}`);

    // Save the folder ID to database
    await storeGoogleTokens(accountantId, freshTokens, folderId);
  } else {
    // Verify the folder still exists
    try {
      const oauth2Client = getOAuthClient();
      oauth2Client.setCredentials(freshTokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      const folderCheck = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, trashed'
      });

      // Check if folder is trashed
      if ((folderCheck.data as any).trashed) {
        throw new Error('Folder is trashed');
      }

      console.log(`✅ Using existing GettingDocs folder`);
    } catch (error) {
      console.log('⚠️ Stored GettingDocs folder not found or deleted, creating new one...');
      const rootFolder = await getOrCreateRootFolder(freshTokens);
      folderId = rootFolder.id;
      console.log(`✅ New GettingDocs folder created: ${rootFolder.webViewLink}`);

      // Update the folder ID in database
      await storeGoogleTokens(accountantId, freshTokens, folderId);
    }
  }

  // 4. Get or create client folder with phone suffix
  const clientFolder = await getOrCreateClientFolder(
    freshTokens,
    folderId,
    clientName,
    clientPhone
  );

  console.log(`📁 Using client folder: ${clientFolder.name}`);

  // 5. Download the file from Twilio URL
  const axios = (await import('axios')).default;

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

  // 6. Generate filename based on naming convention
  const extension = fileType.includes('pdf') ? 'pdf' : fileType.includes('image') ? 'jpg' : 'file';
  const baseFilename = generateDocumentFilename(documentType, period, year, extension);

  // 7. Check for duplicates and get final unique filename
  const filename = await generateUniqueFilename(freshTokens, clientFolder.id, baseFilename);

  console.log(`📄 Uploading file: ${filename}`);

  // 8. Upload file to Google Drive
  const uploadResult = await uploadToGoogleDrive(
    freshTokens,
    clientFolder.id,
    filename,
    fileBuffer,
    fileType
  );

  console.log(`✅ File uploaded to Google Drive: ${uploadResult.webViewLink}`);

  // 9. Update document record with Google Drive info
  await db.query(
    `UPDATE documents
     SET drive_file_id = $1,
         drive_file_url = $2,
         original_filename = $3,
         drive_folder_id = $4
     WHERE id = $5`,
    [uploadResult.id, uploadResult.webViewLink, filename, clientFolder.id, documentId]
  );

  // 10. Create notification for document uploaded to Drive
  try {
    const { createNotification } = await import('../routes/notifications.js');
    await createNotification(
      accountantId,
      'document_uploaded',
      'Document Saved to Drive',
      `${clientName}'s ${documentType} has been saved to Google Drive`,
      clientName,
      `${documentType} - ${period} ${year}`
    );
  } catch (notifError) {
    console.error('Failed to create notification:', notifError);
    // Don't fail upload if notification fails
  }

  return {
    driveFileId: uploadResult.id,
    driveFileUrl: uploadResult.webViewLink,
    driveFileName: filename
  };
}
