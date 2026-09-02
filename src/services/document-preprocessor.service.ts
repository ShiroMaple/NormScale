import fs from 'fs';
import path from 'path';
import { logger } from '@/logger/index.ts';
import { TextTokenItem } from '@/utils/bbox-matcher.ts';

export interface PreprocessedAssets {
  dir: string;
  images: string[];
  imagePaths: string[];
  textFile?: string;
  textPath?: string;
  text?: string;
  tokens?: TextTokenItem[];
  isTextBased: boolean;
  pageCount: number;
}

export interface FileFormatValidation {
  valid: boolean;
  ext: string;
  isPdf: boolean;
  isImage: boolean;
  errorMessage?: string;
}

/**
 * ============================================================================
 * 文档预处理与资产仓储服务 (DocumentPreprocessorService)
 * 职责：
 * 1. 严格校验文件格式（仅支持 PDF 与 PNG/JPEG/JPG/BMP 常见图片格式）；
 * 2. 将原件落盘至 .cache/uploads/{md5}.{ext}；
 * 3. 将分页切图与提取的 text.txt 共同持久化至 .cache/preprocessed/{md5}/；
 * 4. 提供预处理资产检索与级联物理删除。
 * ============================================================================
 */
export class DocumentPreprocessorService {
  private uploadsDir: string;
  private preprocessedDir: string;

  constructor(customUploadsDir?: string, customPreprocessedDir?: string) {
    this.uploadsDir = customUploadsDir || path.join(process.cwd(), '.cache', 'uploads');
    this.preprocessedDir = customPreprocessedDir || path.join(process.cwd(), '.cache', 'preprocessed');
    this.ensureDirs();
  }

  private ensureDirs() {
    try {
      if (!fs.existsSync(this.uploadsDir)) {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      }
      if (!fs.existsSync(this.preprocessedDir)) {
        fs.mkdirSync(this.preprocessedDir, { recursive: true });
      }
    } catch (err) {
      logger.error('EXTRACTOR', `[DocumentPreprocessorService] 初始化缓存目录失败: ${err}`);
    }
  }

  /**
   * 1. 校验输入文件格式
   */
  public validateFormat(filename: string): FileFormatValidation {
    if (!filename || typeof filename !== 'string') {
      return { valid: false, ext: '', isPdf: false, isImage: false, errorMessage: '未指定有效的文件名' };
    }
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf') {
      return { valid: true, ext: '.pdf', isPdf: true, isImage: false };
    }
    if (['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
      return { valid: true, ext, isPdf: false, isImage: true };
    }
    return {
      valid: false,
      ext,
      isPdf: false,
      isImage: false,
      errorMessage: `不支持的文件格式 [${ext}]。系统仅支持工业 PDF 文档及主流图片格式（PNG / JPEG / JPG / BMP）`,
    };
  }

  /**
   * 2. 将上传的原件文件落盘至 .cache/uploads/{md5}.{ext}
   */
  public saveUploadedOriginal(md5: string, filename: string, buffer: Buffer): string {
    this.ensureDirs();
    const validation = this.validateFormat(filename);
    const safeExt = validation.ext || path.extname(filename).toLowerCase() || '.bin';
    const targetPath = path.join(this.uploadsDir, `${md5}${safeExt}`);

    try {
      fs.writeFileSync(targetPath, buffer);
      logger.info(
        'EXTRACTOR',
        `[DocumentPreprocessorService] 原件落盘成功: ${targetPath} (大小: ${(buffer.length / 1024).toFixed(1)} KB)`
      );
      return targetPath;
    } catch (err) {
      logger.error('EXTRACTOR', `[DocumentPreprocessorService] 原件落盘失败 (${md5}): ${err}`);
      throw err;
    }
  }

  /**
   * 3. 将分页切图与文本层分离产物保存到 .cache/preprocessed/{md5}/
   */
  public savePreprocessedAssets(
    md5: string,
    pages: (string | Buffer)[],
    text?: string,
    tokens?: TextTokenItem[]
  ): PreprocessedAssets {
    this.ensureDirs();
    const docPreDir = path.join(this.preprocessedDir, md5);
    if (!fs.existsSync(docPreDir)) {
      fs.mkdirSync(docPreDir, { recursive: true });
    }

    const imageFiles: string[] = [];
    const imagePaths: string[] = [];

    // 保存各页 PNG 图片
    pages.forEach((pageContent, idx) => {
      const pageFileName = `page-${idx + 1}.png`;
      const pageFilePath = path.join(docPreDir, pageFileName);

      if (typeof pageContent === 'string') {
        // Base64 Data URL or raw Base64
        const base64Data = pageContent.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(pageFilePath, imageBuffer);
      } else {
        fs.writeFileSync(pageFilePath, pageContent);
      }

      imageFiles.push(pageFileName);
      imagePaths.push(pageFilePath);
    });

    let textFile: string | undefined;
    let textPath: string | undefined;
    const cleanText = (text || '').trim();
    const isTextBased = cleanText.length > 20;

    // 若提取到了有效文本层，保存为 text.txt
    if (cleanText.length > 0) {
      textFile = 'text.txt';
      textPath = path.join(docPreDir, 'text.txt');
      fs.writeFileSync(textPath, cleanText, 'utf-8');
      logger.info(
        'EXTRACTOR',
        `[DocumentPreprocessorService] 提取并保存文本层 (${cleanText.length} 字符): ${textPath}`
      );
    }

    // 若传入了 Token 物理坐标，保存为 tokens.json
    if (tokens && tokens.length > 0) {
      const tokensPath = path.join(docPreDir, 'tokens.json');
      fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
      logger.info(
        'EXTRACTOR',
        `[DocumentPreprocessorService] 提取并保存 ${tokens.length} 个文本 Token 物理坐标: ${tokensPath}`
      );
    }

    logger.info(
      'EXTRACTOR',
      `[DocumentPreprocessorService] 预处理产物落盘完毕 [${md5}]: ${imageFiles.length} 张切图, isTextBased=${isTextBased}`
    );

    return {
      dir: docPreDir,
      images: imageFiles,
      imagePaths,
      textFile,
      textPath,
      text: cleanText || undefined,
      tokens,
      isTextBased,
      pageCount: imageFiles.length,
    };
  }

  /**
   * 4. 检索指定 MD5 是否存在预处理产物
   */
  public getPreprocessed(md5: string): PreprocessedAssets | null {
    if (!md5) return null;
    const docPreDir = path.join(this.preprocessedDir, md5);
    if (!fs.existsSync(docPreDir)) return null;

    try {
      const files = fs.readdirSync(docPreDir);
      const imageFiles = files
        .filter(f => f.startsWith('page-') && f.endsWith('.png'))
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
          const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
          return numA - numB;
        });

      if (imageFiles.length === 0) return null;

      const imagePaths = imageFiles.map(f => path.join(docPreDir, f));
      let textFile: string | undefined;
      let textPath: string | undefined;
      let text: string | undefined;
      let tokens: TextTokenItem[] | undefined;

      if (files.includes('text.txt')) {
        textFile = 'text.txt';
        textPath = path.join(docPreDir, 'text.txt');
        text = fs.readFileSync(textPath, 'utf-8');
      }

      if (files.includes('tokens.json')) {
        try {
          const rawTokens = fs.readFileSync(path.join(docPreDir, 'tokens.json'), 'utf-8');
          tokens = JSON.parse(rawTokens);
        } catch {
          // ignore
        }
      }

      const isTextBased = Boolean(text && text.trim().length > 20);

      return {
        dir: docPreDir,
        images: imageFiles,
        imagePaths,
        textFile,
        textPath,
        text,
        tokens,
        isTextBased,
        pageCount: imageFiles.length,
      };
    } catch (err) {
      logger.warn('EXTRACTOR', `[DocumentPreprocessorService] 读取预处理产物异常 (${md5}): ${err}`);
      return null;
    }
  }

  /**
   * 5. 级联清理 uploads 原件与 preprocessed 产物目录
   */
  public deletePreprocessedAndUploads(md5: string): void {
    if (!md5) return;
    try {
      // 1. 删除 preprocessed 目录
      const docPreDir = path.join(this.preprocessedDir, md5);
      if (fs.existsSync(docPreDir)) {
        fs.rmSync(docPreDir, { recursive: true, force: true });
        logger.info('EXTRACTOR', `[DocumentPreprocessorService] 已清理预处理目录: ${docPreDir}`);
      }

      // 2. 匹配并删除 uploads 中的原件
      if (fs.existsSync(this.uploadsDir)) {
        const uploadFiles = fs.readdirSync(this.uploadsDir);
        for (const file of uploadFiles) {
          if (file.startsWith(md5)) {
            const filePath = path.join(this.uploadsDir, file);
            fs.unlinkSync(filePath);
            logger.info('EXTRACTOR', `[DocumentPreprocessorService] 已清理原件: ${filePath}`);
          }
        }
      }
    } catch (err) {
      logger.error('EXTRACTOR', `[DocumentPreprocessorService] 级联删除文件异常 (${md5}): ${err}`);
    }
  }
}

export const globalDocumentPreprocessorService = new DocumentPreprocessorService();
