import fs from 'node:fs';
import path from 'node:path';

export interface StandardClause {
  clause_id: string;
  title: string;
  text: string;
}

export class ClauseStore {
  private baseDir: string;
  private clausesCache: Map<string, StandardClause[]> = new Map();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'data/standards');
  }

  private normalizeStandardId(id: string): string {
    return id.toUpperCase().replace(/[\s\-_/\\]/g, '');
  }

  /**
   * 加载指定标准的条款全文
   */
  public async getClauses(standardId: string): Promise<StandardClause[]> {
    const normStdId = this.normalizeStandardId(standardId);
    if (this.clausesCache.has(normStdId)) {
      return this.clausesCache.get(normStdId)!;
    }

    // 尝试寻找 clauses.json
    const directPath = path.join(this.baseDir, standardId.replace(/[/\-]/g, '_'), 'clauses.json');
    if (fs.existsSync(directPath)) {
      const data = JSON.parse(fs.readFileSync(directPath, 'utf8'));
      this.clausesCache.set(normStdId, data);
      return data;
    }

    // 扫描目录
    if (fs.existsSync(this.baseDir)) {
      const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && this.normalizeStandardId(entry.name) === normStdId) {
          const cPath = path.join(this.baseDir, entry.name, 'clauses.json');
          if (fs.existsSync(cPath)) {
            const data = JSON.parse(fs.readFileSync(cPath, 'utf8'));
            this.clausesCache.set(normStdId, data);
            return data;
          }
        }
      }
    }

    return [];
  }

  /**
   * 关键词模糊搜索标准条款
   */
  public async searchClauses(standardId: string, query: string): Promise<StandardClause[]> {
    const clauses = await this.getClauses(standardId);
    const q = query.toLowerCase().trim();
    return clauses.filter(c =>
      c.clause_id.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.text.toLowerCase().includes(q)
    );
  }
}
