export async function convertWithBankToFile(pdfBuffer) {
  const formData = new FormData();

  // Convert Buffer to Blob-compatible format
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
  formData.append('file', blob, 'statement.pdf');
  formData.append('format', 'csv');

  const response = await fetch(`${process.env.BANKTOFILE_API_URL}/api/convert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.BANKTOFILE_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`BankToFile conversion failed: ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
