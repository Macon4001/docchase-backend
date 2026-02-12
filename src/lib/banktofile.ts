import axios from 'axios';
import { db } from './db.js';

const BANKTOFILE_API_KEY = process.env.BANKTOFILE_API_KEY;
const BANKTOFILE_API_URL = 'https://api.banktofile.com/v1';

if (!BANKTOFILE_API_KEY) {
  console.warn('⚠️ BankToFile API key not configured');
}

/**
 * Convert a bank statement PDF to CSV using BankToFile API
 */
export async function convertPdfToCsv(
  driveFileId: string,
  driveFileUrl: string,
  documentId: string
): Promise<{ csvUrl: string; transactions: number }> {
  if (!BANKTOFILE_API_KEY) {
    throw new Error('BankToFile API key not configured');
  }

  try {
    console.log(`🔄 Converting PDF to CSV: ${driveFileUrl}`);

    // Update document status to converting
    await db.query(
      `UPDATE documents
       SET conversion_status = 'converting'
       WHERE id = $1`,
      [documentId]
    );

    // Submit PDF to BankToFile for conversion
    const response = await axios.post(
      `${BANKTOFILE_API_URL}/convert`,
      {
        file_url: driveFileUrl,
        output_format: 'csv',
      },
      {
        headers: {
          'Authorization': `Bearer ${BANKTOFILE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { job_id } = response.data;

    // Poll for completion (BankToFile is async)
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10 second intervals

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      const statusResponse = await axios.get(
        `${BANKTOFILE_API_URL}/convert/${job_id}`,
        {
          headers: {
            'Authorization': `Bearer ${BANKTOFILE_API_KEY}`,
          },
        }
      );

      const { status, csv_url, transaction_count } = statusResponse.data;

      if (status === 'completed') {
        console.log(`✅ PDF converted to CSV: ${transaction_count} transactions`);

        // Update document with CSV info
        await db.query(
          `UPDATE documents
           SET csv_drive_file_url = $1,
               conversion_status = 'converted'
           WHERE id = $2`,
          [csv_url, documentId]
        );

        return { csvUrl: csv_url, transactions: transaction_count };
      } else if (status === 'failed') {
        throw new Error('PDF conversion failed');
      }

      attempts++;
    }

    throw new Error('PDF conversion timed out');
  } catch (error) {
    console.error('❌ BankToFile conversion error:', error);

    // Update document status to conversion_failed
    await db.query(
      `UPDATE documents
       SET conversion_status = 'conversion_failed'
       WHERE id = $1`,
      [documentId]
    );

    throw error;
  }
}

/**
 * Process a document: Upload to Drive and convert to CSV
 * This is the main function called by the webhook handler
 */
export async function processDocument(
  documentId: string,
  accountantId: string,
  campaignId: string,
  documentType: string,
  period: string,
  clientName: string,
  clientPhone: string,
  fileUrl: string,
  fileType: string
): Promise<{
  driveFileId: string;
  driveFileUrl: string;
  csvUrl?: string;
  transactions?: number;
}> {
  // Import here to avoid circular dependency
  const { uploadCampaignDocument } = await import('./google-drive.js');

  try {
    // Extract year from period (e.g., "January 2026" -> "2026" or just use current year)
    const currentYear = new Date().getFullYear().toString();
    let year = currentYear;

    // Try to extract year from period if it contains one
    const yearMatch = period.match(/\d{4}/);
    if (yearMatch) {
      year = yearMatch[0];
    }

    // Step 1: Upload to Google Drive
    const { driveFileId, driveFileUrl } = await uploadCampaignDocument(
      accountantId,
      campaignId,
      documentType,
      period.replace(/\s*\d{4}\s*/g, '').trim(), // Remove year from period
      year,
      clientName,
      clientPhone,
      fileUrl,
      fileType,
      documentId
    );

    // Step 2: If it's a PDF, convert to CSV
    if (fileType.includes('pdf')) {
      try {
        const { csvUrl, transactions } = await convertPdfToCsv(
          driveFileId,
          driveFileUrl,
          documentId
        );

        return {
          driveFileId,
          driveFileUrl,
          csvUrl,
          transactions,
        };
      } catch (conversionError) {
        console.error('⚠️ PDF conversion failed, but file is uploaded to Drive:', conversionError);
        // Don't fail the entire process if conversion fails
        return {
          driveFileId,
          driveFileUrl,
        };
      }
    }

    return {
      driveFileId,
      driveFileUrl,
    };
  } catch (error) {
    console.error('❌ Document processing error:', error);
    throw error;
  }
}
