import { RECEIPT_MAX_BYTES, validateReceiptFile, validateReceiptValue } from './receiptValidation';

describe('Local receipt policy (not server scanning)', () => {
  const photo = (): File => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], 'synthetic.jpg', { type: 'image/jpeg' });
  let originalImage: typeof Image;
  beforeEach(() => {
    originalImage = window.Image;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:synthetic-policy') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    window.Image = jest.fn(() => {
      const image = document.createElement('img');
      Object.defineProperty(image, 'naturalWidth', { value: 10 }); Object.defineProperty(image, 'naturalHeight', { value: 10 });
      Object.defineProperty(image, 'src', { get: () => 'blob:synthetic-policy', set: () => { Promise.resolve().then(() => image.dispatchEvent(new Event('load'))).catch(() => undefined); } });
      return image;
    }) as unknown as typeof Image;
  });
  afterEach(() => { window.Image = originalImage; });
  it('requires a receipt choice or nonblank no-receipt reason', () => {
    expect(validateReceiptValue({ kind: 'none' })).toContain('Choose');
    expect(validateReceiptValue({ kind: 'no-receipt', reason: '  ' })).toContain('reason');
    expect(validateReceiptValue({ kind: 'no-receipt', reason: 'Synthetic missing receipt' })).toBeUndefined();
    expect(validateReceiptValue({ kind: 'file', file: photo() })).toBeUndefined();
  });
  it('accepts matching JPEG/PNG and a simple complete PDF', async () => {
    expect(await validateReceiptFile(photo())).toBeUndefined();
    expect(await validateReceiptFile(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'synthetic.png', { type: 'image/png' }))).toBeUndefined();
    expect(await validateReceiptFile(new File(['%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'], 'synthetic.pdf', { type: 'application/pdf' }))).toBeUndefined();
  });
  it('rejects empty, oversized, SVG, HTML and MIME/extension mismatch', async () => {
    expect(await validateReceiptFile(new File([], 'empty.jpg', { type: 'image/jpeg' }))).toContain('empty');
    const large = photo(); Object.defineProperty(large, 'size', { value: RECEIPT_MAX_BYTES + 1 });
    expect(await validateReceiptFile(large)).toContain('10 MiB');
    expect(await validateReceiptFile(new File(['<svg/>'], 'receipt.svg', { type: 'image/svg+xml' }))).toContain('Choose a JPEG');
    expect(await validateReceiptFile(new File(['<html/>'], 'receipt.html', { type: 'text/html' }))).toContain('Choose a JPEG');
    expect(await validateReceiptFile(new File(['%PDF-1.4'], 'receipt.jpg', { type: 'application/pdf' }))).toContain('matching');
  });
  it('rejects spoofed signatures and incomplete PDFs', async () => {
    expect(await validateReceiptFile(new File(['not image'], 'receipt.jpg', { type: 'image/jpeg' }))).toContain('does not contain a JPEG');
    expect(await validateReceiptFile(new File(['not png'], 'receipt.png', { type: 'image/png' }))).toContain('does not contain a PNG');
    expect(await validateReceiptFile(new File(['not pdf'], 'receipt.pdf', { type: 'application/pdf' }))).toContain('does not contain a PDF');
    expect(await validateReceiptFile(new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }))).toContain('incomplete');
  });
  it.each(['JavaScript', 'JS', 'Launch', 'OpenAction', 'AA', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia', 'XFA', 'URI', 'GoToR', 'SubmitForm', 'ImportData', 'Encrypt', 'J#61vaScript'])('rejects active PDF marker %s', async marker => {
    expect(await validateReceiptFile(new File([`%PDF-1.4\n/Type /Catalog /${marker} (active)\n%%EOF`], 'synthetic.pdf', { type: 'application/pdf' }))).toContain('active or embedded');
  });
  it('rejects HEIC without a valid container brand', async () => {
    expect(await validateReceiptFile(new File(['not HEIC'], 'receipt.heic', { type: 'image/heic' }))).toContain('does not contain');
  });
  it('requires actual native HEIC decoding and revokes its temporary object URL', async () => {
    const create = jest.fn(() => 'blob:synthetic-heic'); const revoke = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const mockImage = document.createElement('img');
    Object.defineProperty(mockImage, 'src', { get: () => 'blob:synthetic-heic', set: () => { Promise.resolve().then(() => mockImage.dispatchEvent(new Event('error'))).catch(() => undefined); } });
    const originalImage = window.Image;
    window.Image = jest.fn(() => mockImage) as unknown as typeof Image;
    try {
      const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99]);
      expect(await validateReceiptFile(new File([bytes], 'synthetic.heic', { type: 'image/heic' }))).toContain('Convert the photo');
      expect(revoke).toHaveBeenCalledWith('blob:synthetic-heic');
    } finally { window.Image = originalImage; }
  });
});
