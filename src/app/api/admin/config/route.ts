import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const LlmConfigItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  thinkingEffort: z.string().optional(),
  apiKey: z.string().min(1),
  isDefault: z.boolean().optional(),
});

const AdminConfigSchema = z.object({
  llm: z.object({
    timeoutMs: z.number().min(1000).max(600000),
    maxRetries: z.number().min(0).max(5),
    configs: z.array(LlmConfigItemSchema).min(1),
    pricing: z.record(
      z.object({
        inputPer1M: z.number(),
        outputPer1M: z.number(),
      })
    ).optional(),
  }),
});

function getConfigFilePath(): string {
  return path.join(process.cwd(), 'config.json');
}

/**
 * GET /api/admin/config: 读取服务端 config.json 配置
 */
export async function GET() {
  try {
    const configPath = getConfigFilePath();
    if (!fs.existsSync(configPath)) {
      return NextResponse.json(
        { success: false, error: 'config.json 配置文件不存在' },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json({
      success: true,
      config: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `读取配置失败: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/config: 更新并持久化保存 config.json 配置
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = AdminConfigSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: '配置格式校验不通过',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const validatedConfig = parseResult.data;

    // 保证至少有且仅有一个 default 配置项
    const defaultIndex = validatedConfig.llm.configs.findIndex(c => c.isDefault);
    if (defaultIndex === -1) {
      validatedConfig.llm.configs[0]!.isDefault = true;
    } else {
      validatedConfig.llm.configs.forEach((c, idx) => {
        c.isDefault = idx === defaultIndex;
      });
    }

    const configPath = getConfigFilePath();
    fs.writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      message: '系统配置已持久化保存',
      config: validatedConfig,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `写入配置失败: ${err.message}` },
      { status: 500 }
    );
  }
}
