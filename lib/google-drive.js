import { google } from 'googleapis';
import { Readable } from 'stream';

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
  });
}

export async function getTokensFromCode(code) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function uploadToGoogleDrive(tokens, folderId, filename, buffer, mimeType) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Create a readable stream from buffer
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const requestBody: any = {
    name: filename,
  };

  if (folderId) {
    requestBody.parents = [folderId];
  }

  const response = await drive.files.create({
    requestBody,
    media: {
      mimeType: mimeType,
      body: stream,
    },
    fields: 'id, webViewLink',
  });

  return {
    id: response.data.id!,
    webViewLink: response.data.webViewLink!,
  };
}

export async function createFolder(
  tokens: any,
  folderName: string,
  parentFolderId: string | null = null
): Promise<{ id: string; webViewLink: string }> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const requestBody: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentFolderId) {
    requestBody.parents = [parentFolderId];
  }

  const response = await drive.files.create({
    requestBody,
    fields: 'id, webViewLink',
  });

  return {
    id: response.data.id!,
    webViewLink: response.data.webViewLink!,
  };
}
