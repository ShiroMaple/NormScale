import fs from 'node:fs';
import path from 'node:path';

import { StandardClause } from '../schemas/standard.schema';

export type { StandardClause };

export class ClauseStore {
  private baseDir: string;
  private clausesCache: Map<string, StandardClause[]> = new Map();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'data/standards');
  }

  private normalizeStandardId(id: string): string {
    return id.toUpperCase().replace(/[\s\-_/\\]/g, '');
  }

  private flattenClauses(list: any[]): StandardClause[] {
    const result: StandardClause[] = [];
    const recurse = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.clause_id && (node.text || node.title)) {
          result.push({
            clause_id: String(node.clause_id),
            title: String(node.title || node.clause_id),
            text: String(node.text || ''),
          });
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          recurse(node.children);
        }
      }
    };
    if (Array.isArray(list)) {
      recurse(list);
    }
    return result;
  }

  /**
   * 加载指定标准的条款全文
   */
  public async getClauses(standardId: string): Promise<StandardClause[]> {
    const normStdId = this.normalizeStandardId(standardId);
    if (this.clausesCache.has(normStdId)) {
      return this.clausesCache.get(normStdId)!;
    }

    const tryLoadFromDir = (dir: string): StandardClause[] | undefined => {
      const treePath = path.join(dir, 'clauses_tree.json');
      if (fs.existsSync(treePath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(treePath, 'utf8'));
          return this.flattenClauses(raw);
        } catch {}
      }
      const flatPath = path.join(dir, 'clauses.json');
      if (fs.existsSync(flatPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(flatPath, 'utf8'));
          return Array.isArray(raw) ? raw : [];
        } catch {}
      }
      return undefined;
    };

    // 尝试寻找直连目录
    const directDir = path.join(this.baseDir, standardId.replace(/[/\-]/g, '_'));
    const directRes = tryLoadFromDir(directDir);
    if (directRes && directRes.length > 0) {
      this.clausesCache.set(normStdId, directRes);
      return directRes;
    }

    // 扫描匹配目录
    if (fs.existsSync(this.baseDir)) {
      const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && this.normalizeStandardId(entry.name) === normStdId) {
          const res = tryLoadFromDir(path.join(this.baseDir, entry.name));
          if (res && res.length > 0) {
            this.clausesCache.set(normStdId, res);
            return res;
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
