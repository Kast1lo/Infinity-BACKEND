import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as crypto from 'crypto';

export interface GeneratedSubtask {
  title: string;
}

export interface GeneratedTask {
  title:    string;
  notes:    string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  subtasks: GeneratedSubtask[];
}

export interface GenerateResult {
  tasks: GeneratedTask[];
}

@Injectable()
export class GigachatService {
  private readonly logger = new Logger(GigachatService.name);

  private cachedToken: { token: string; expiresAt: number } | null = null;

  private readonly OAUTH_URL  = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
  private readonly CHAT_URL   = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
  private readonly MODEL_NAME = 'GigaChat';

  constructor(private readonly config: ConfigService) {}

  async generateTasksFromDescription(
    projectName:        string,
    projectDescription: string,
    existingColumnNames: string[],
  ): Promise<GenerateResult> {
    const accessToken = await this.getAccessToken();

    const systemPrompt = this.buildSystemPrompt(existingColumnNames);
    const userPrompt   = this.buildUserPrompt(projectName, projectDescription);

    const body = JSON.stringify({
      model:       this.MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      temperature: 0.7,
      max_tokens:  2000,
    });

    const response = await this.httpsRequest(this.CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body,
    });

    if (response.status < 200 || response.status >= 300) {
      this.logger.error(`GigaChat chat error ${response.status}: ${response.body.slice(0, 500)}`);
      throw new BadGatewayException('Не удалось получить ответ от GigaChat');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new BadGatewayException('GigaChat вернул некорректный ответ');
    }

    const content: string | undefined = parsed?.choices?.[0]?.message?.content;
    if (!content) {
      throw new BadGatewayException('GigaChat вернул пустой ответ');
    }

    return this.parseTasksResponse(content);
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.token;
    }

    const authKey = this.config.get<string>('GIGACHAT_AUTH_KEY');
    const scope   = this.config.get<string>('GIGACHAT_SCOPE') ?? 'GIGACHAT_API_PERS';

    if (!authKey) {
      throw new InternalServerErrorException(
        'GigaChat не настроен: укажите GIGACHAT_AUTH_KEY в .env',
      );
    }

    const rqUid = crypto.randomUUID();
    const body  = `scope=${encodeURIComponent(scope)}`;

    const response = await this.httpsRequest(this.OAUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authKey}`,
        'RqUID':         rqUid,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Accept':        'application/json',
      },
      body,
    });

    if (response.status < 200 || response.status >= 300) {
      this.logger.error(`GigaChat oauth error ${response.status}: ${response.body.slice(0, 500)}`);
      throw new BadGatewayException('Не удалось получить токен GigaChat');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new BadGatewayException('GigaChat вернул некорректный oauth-ответ');
    }

    const token     = parsed?.access_token as string | undefined;
    const expiresAt = Number(parsed?.expires_at);

    if (!token || !expiresAt) {
      throw new BadGatewayException('GigaChat не вернул access_token');
    }

    this.cachedToken = { token, expiresAt };
    return token;
  }

  private buildSystemPrompt(columnNames: string[]): string {
    const columnsHint = columnNames.length
      ? `Доступные колонки Kanban-доски: ${columnNames.join(', ')}.`
      : 'Колонок пока нет — задачи распределять не нужно.';

    return [
      'Ты опытный руководитель проектов. Твоя задача — по названию и описанию проекта',
      'сформировать структурированный список задач и подзадач.',
      columnsHint,
      'Верни ответ строго в формате JSON без дополнительного текста, без markdown-блоков:',
      '{',
      '  "tasks": [',
      '    {',
      '      "title": "Краткое название задачи (до 100 символов)",',
      '      "notes": "Развёрнутое описание задачи (1-3 предложения)",',
      '      "priority": "HIGH" | "MEDIUM" | "LOW",',
      '      "subtasks": [ { "title": "Подзадача 1" }, { "title": "Подзадача 2" } ]',
      '    }',
      '  ]',
      '}',
      'Правила:',
      '- Сгенерируй от 5 до 8 задач, упорядоченных по приоритету (сначала HIGH, потом MEDIUM, потом LOW).',
      '- Для каждой задачи — от 2 до 5 подзадач, конкретных и выполнимых.',
      '- priority может быть только "HIGH", "MEDIUM" или "LOW" (заглавными буквами).',
      '- Используй русский язык.',
      '- НЕ добавляй текст вне JSON, не оборачивай в ```json блоки.',
    ].join('\n');
  }

  private buildUserPrompt(name: string, description: string): string {
    return [
      `Название проекта: ${name}`,
      '',
      'Описание проекта:',
      description || '(описание не предоставлено)',
    ].join('\n');
  }

  private parseTasksResponse(content: string): GenerateResult {
    let jsonStr = content.trim();

    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace  = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new BadGatewayException('GigaChat не вернул JSON');
    }
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new BadGatewayException('GigaChat вернул некорректный JSON');
    }

    if (!parsed || !Array.isArray(parsed.tasks)) {
      throw new BadGatewayException('GigaChat вернул JSON без поля tasks');
    }

    const allowedPriorities = new Set(['HIGH', 'MEDIUM', 'LOW']);

    const tasks: GeneratedTask[] = parsed.tasks
      .filter((t: any) => t && typeof t.title === 'string' && t.title.trim().length > 0)
      .map((t: any) => {
        const priority = typeof t.priority === 'string' && allowedPriorities.has(t.priority.toUpperCase())
          ? (t.priority.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW')
          : 'MEDIUM';

        const subtasks: GeneratedSubtask[] = Array.isArray(t.subtasks)
          ? t.subtasks
              .map((s: any) => {
                if (typeof s === 'string') return { title: s.trim() };
                if (s && typeof s.title === 'string') return { title: s.title.trim() };
                return null;
              })
              .filter((s: GeneratedSubtask | null): s is GeneratedSubtask => !!s && s.title.length > 0)
              .slice(0, 10)
          : [];

        return {
          title:    String(t.title).trim().slice(0, 255),
          notes:    typeof t.notes === 'string' ? t.notes.trim().slice(0, 5000) : null,
          priority,
          subtasks,
        };
      })
      .slice(0, 12);

    if (tasks.length === 0) {
      throw new BadGatewayException('GigaChat не сгенерировал ни одной задачи');
    }

    return { tasks };
  }

  private httpsRequest(
    url: string,
    options: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = https.request(
        {
          method:   options.method,
          hostname: parsedUrl.hostname,
          port:     parsedUrl.port || 443,
          path:     parsedUrl.pathname + parsedUrl.search,
          headers:  options.headers,
          rejectUnauthorized: false,
          timeout:  30_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              body:   Buffer.concat(chunks).toString('utf-8'),
            });
          });
        },
      );

      req.on('error',   reject);
      req.on('timeout', () => {
        req.destroy(new Error('GigaChat request timed out'));
      });

      if (options.body) req.write(options.body);
      req.end();
    });
  }
}
