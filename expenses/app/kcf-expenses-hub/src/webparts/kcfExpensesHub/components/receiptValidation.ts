/** Prototype policy only. Trusted server validation/scanning remains a real-Save gate. */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export type INewReceiptValue = { kind: 'none' } | { kind: 'no-receipt'; reason: string } | { kind: 'file'; file: File };

export function validateReceiptValue(value: INewReceiptValue): string | undefined {
  if (value.kind === 'none') return 'Choose a receipt or select No receipt available and write a reason.';
  if (value.kind === 'no-receipt' && !value.reason.trim()) return 'Write a reason why no receipt is available.';
  return undefined;
}

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('The file could not be read. Choose it again.'));
    reader.readAsArrayBuffer(file);
  });
}

function canDecodeImage(file: File): Promise<boolean> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let completed = false;
    const timer: { id?: ReturnType<typeof setTimeout> } = {};
    const finish = (result: boolean): void => {
      if (completed) return;
      completed = true; if (timer.id !== undefined) clearTimeout(timer.id); URL.revokeObjectURL(url); resolve(result);
    };
    timer.id = setTimeout(() => finish(false), 5000);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

export async function validateReceiptFile(file: File): Promise<string | undefined> {
  if (file.size === 0) return 'This file is empty. Choose a photo or PDF.';
  if (file.size > RECEIPT_MAX_BYTES) return 'Receipt files must be 10 MiB or smaller.';
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowed: Record<string, string[]> = {
    jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], pdf: ['application/pdf'],
    heic: ['image/heic', 'image/heif'], heif: ['image/heif', 'image/heic']
  };
  if (!extension || !allowed[extension] || allowed[extension].indexOf(file.type.toLowerCase()) < 0) {
    return 'Choose a JPEG, PNG or PDF with a matching file type. HEIC needs native browser support.';
  }
  let bytes: Uint8Array;
  try { bytes = await readBytes(file); } catch { return 'The file could not be read. Choose it again.'; }
  const starts = (signature: number[]): boolean => signature.every((byte, index) => bytes[index] === byte);
  if (extension === 'jpg' || extension === 'jpeg') {
    if (!starts([0xff, 0xd8, 0xff])) return 'This file does not contain a JPEG photo.';
  } else if (extension === 'png') {
    if (!starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'This file does not contain a PNG photo.';
  } else if (extension === 'pdf') {
    if (!starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'This file does not contain a PDF.';
    // Decode PDF name escapes before checking known active-content markers. This
    // is conservative screening, not a parser, malware scan or security PASS.
    let text = '';
    for (let start = 0; start < bytes.length; start += 8192) {
      text += String.fromCharCode(...Array.from(bytes.subarray(start, start + 8192)));
    }
    text = text.replace(/#([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (!/%%EOF\s*$/.test(text)) return 'This PDF is incomplete or unsupported. Choose a complete PDF.';
    if (/\/(?:JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|URI|GoToR|SubmitForm|ImportData|Encrypt)\b/i.test(text)) {
      return 'This PDF contains active or embedded content. Choose a simple receipt PDF or photo.';
    }
  } else {
    const brand = String.fromCharCode(...Array.from(bytes.subarray(4, 12)));
    if (!/^ftyp(?:heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return 'This file does not contain a supported HEIC photo.';
    try {
      if (!await canDecodeImage(file)) return 'This browser cannot preview HEIC. Convert the photo to JPEG or PNG, then choose it.';
    } catch { return 'This browser cannot preview HEIC. Convert the photo to JPEG or PNG, then choose it.'; }
  }
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'png') {
    try {
      if (!await canDecodeImage(file)) return 'This photo cannot be decoded. Choose a readable JPEG or PNG.';
    } catch { return 'This photo cannot be decoded. Choose a readable JPEG or PNG.'; }
  }
  return undefined;
}
