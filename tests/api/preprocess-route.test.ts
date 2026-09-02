import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { POST } from '../../src/app/api/documents/preprocess/route.ts';

describe('API: /api/documents/preprocess (即时预处理与切图落盘端点)', () => {
  const createdMd5s: string[] = [];

  afterEach(() => {
    // 清理测试落盘产物
    for (const md5 of createdMd5s) {
      const uploadPattern = path.join(process.cwd(), '.cache', 'uploads');
      if (fs.existsSync(uploadPattern)) {
        const files = fs.readdirSync(uploadPattern);
        for (const file of files) {
          if (file.startsWith(md5)) {
            try {
              fs.unlinkSync(path.join(uploadPattern, file));
            } catch {
              // ignore
            }
          }
        }
      }
      const preDir = path.join(process.cwd(), '.cache', 'preprocessed', md5);
      if (fs.existsSync(preDir)) {
        try {
          fs.rmSync(preDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  });

  it('未提供文件内容应返回 400', async () => {
    const req = new Request('http://localhost:3000/api/documents/preprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('非法格式应返回 400 拦截', async () => {
    const req = new Request('http://localhost:3000/api/documents/preprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'malicious.exe',
        fileBase64: Buffer.from('Fake exe').toString('base64'),
      }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('仅支持');
  });

  it('合法 PDF 上传应即时将原件落盘至 uploads 且切图与文本落盘至 preprocessed', async () => {
    const fileContent = Buffer.from('%PDF-1.4 Mock PDF Stream');
    const fakePage1 = 'data:image/png;base64,' + Buffer.from('Fake PNG Page 1').toString('base64');
    const fakePage2 = 'data:image/png;base64,' + Buffer.from('Fake PNG Page 2').toString('base64');
    const fakeText = '镇海石化质保书 牌号 06Cr18Ni11Ti 炉号 Z26022C';

    const req = new Request('http://localhost:3000/api/documents/preprocess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: '测试质保书_即时预处理.pdf',
        fileBase64: fileContent.toString('base64'),
        extractedText: fakeText,
        pageImages: [fakePage1, fakePage2],
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.pageCount).toBe(2);
    expect(data.isTextBased).toBe(true);
    expect(data.md5).toBeDefined();

    createdMd5s.push(data.md5);

    // 验证物理磁盘文件是否真实存在
    const savedOriginal = path.join(process.cwd(), '.cache', 'uploads', `${data.md5}.pdf`);
    const preDir = path.join(process.cwd(), '.cache', 'preprocessed', data.md5);
    const page1Path = path.join(preDir, 'page-1.png');
    const page2Path = path.join(preDir, 'page-2.png');
    const textPath = path.join(preDir, 'text.txt');

    expect(fs.existsSync(savedOriginal)).toBe(true);
    expect(fs.existsSync(preDir)).toBe(true);
    expect(fs.existsSync(page1Path)).toBe(true);
    expect(fs.existsSync(page2Path)).toBe(true);
    expect(fs.existsSync(textPath)).toBe(true);
    expect(fs.readFileSync(textPath, 'utf-8')).toBe(fakeText);
  });
});
