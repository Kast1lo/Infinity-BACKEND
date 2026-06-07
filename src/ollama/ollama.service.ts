import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';

export interface GeneratedSubtask {
  title: string;
}

export interface GeneratedTask {
  title:     string;
  notes:     string | null;
  priority:  'HIGH' | 'MEDIUM' | 'LOW';
  color:     string | null;
  dueInDays: number | null;
  column:    string | null;
  subtasks:  GeneratedSubtask[];
}

export interface GenerateResult {
  columns: string[];
  tasks:   GeneratedTask[];
}

// Палитра цветов задач — должна совпадать с labelColors на фронтенде (kanban-board.ts)
export const TASK_COLORS = [
  '#e05555', // красный
  '#e08c2a', // оранжевый
  '#d4b84a', // жёлтый
  '#4caf76', // зелёный
  '#4a9eff', // синий
  '#9c6bda', // фиолетовый
] as const;

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  private readonly baseUrl: string;
  private readonly model:   string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434')
      .replace(/\/+$/, '');
    this.model = this.config.get<string>('OLLAMA_MODEL') ?? 'qwen2.5';
  }

  async generateTasksFromDescription(
    projectName:         string,
    projectDescription:  string,
    existingColumnNames: string[],
  ): Promise<GenerateResult> {
    const systemPrompt = this.buildSystemPrompt(existingColumnNames);
    const userPrompt   = this.buildUserPrompt(projectName, projectDescription);

    let res: { status: number; body: string };
    try {
      res = await this.httpPostJson(`${this.baseUrl}/api/chat`, {
        model:  this.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        options: { temperature: 0.7, num_predict: 4096 },
      }, 600_000);
    } catch (err) {
      this.logger.error(`Ollama request failed: ${(err as Error).message}`);
      throw new BadGatewayException(
        'Не удалось подключиться к ИИ-сервису. Убедитесь, что Ollama запущена.',
      );
    }

    if (res.status < 200 || res.status >= 300) {
      this.logger.error(`Ollama error ${res.status}: ${res.body.slice(0, 500)}`);
      if (res.status === 404) {
        throw new BadGatewayException(
          `Модель «${this.model}» не найдена в Ollama. Выполните: ollama pull ${this.model}`,
        );
      }
      throw new BadGatewayException('ИИ-сервис вернул ошибку');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      throw new BadGatewayException('ИИ-сервис вернул некорректный ответ');
    }

    const content: string | undefined = parsed?.message?.content;
    if (!content) {
      throw new BadGatewayException('ИИ-сервис вернул пустой ответ');
    }

    return this.parseTasksResponse(content);
  }

  private buildSystemPrompt(columnNames: string[]): string {
    const hasExisting = columnNames.length > 0;

    const columnsRule = hasExisting
      ? [
          `- У доски уже есть колонки: ${columnNames.join(', ')}.`,
          '- В поле "columns" верни РОВНО эти названия в том же виде, новые НЕ придумывай.',
          '- Каждую задачу через поле "column" отнеси к одной из этих колонок.',
        ].join('\n')
      : [
          '- Создай несколько колонок-этапов, логично отражающих ход работы',
          '  (например: Планирование, Дизайн, Разработка, Тестирование, Запуск).',
          '- Каждую задачу через поле "column" отнеси к одной из созданных колонок',
          '  (значение должно ТОЧНО совпадать с одним из названий в "columns").',
        ].join('\n');

    return [
      'Ты — русскоязычный помощник-руководитель проектов. По названию и описанию проекта',
      'составь Kanban-доску: колонки-этапы и задачи, распределённые по этим колонкам.',
      'КРИТИЧЕСКИ ВАЖНО: все тексты (названия колонок, задач, подзадач, описания)',
      'пиши ИСКЛЮЧИТЕЛЬНО на русском языке. Английский язык ЗАПРЕЩЕН.',
      'Верни ответ строго в формате JSON без дополнительного текста, без markdown-блоков:',
      '{',
      '  "columns": ["Название этапа 1", "Название этапа 2", "Название этапа 3"],',
      '  "tasks": [',
      '    {',
      '      "title": "Краткое название задачи на русском (до 100 символов)",',
      '      "notes": "Развёрнутое описание задачи на русском (1-3 предложения)",',
      '      "priority": "HIGH" | "MEDIUM" | "LOW",',
      '      "color": "#e05555",',
      '      "dueInDays": 7,',
      '      "column": "Название этапа 1",',
      '      "subtasks": [ { "title": "Подзадача на русском" }, { "title": "Подзадача на русском" } ]',
      '    }',
      '  ]',
      '}',
      'Правила:',
      columnsRule,
      '- Создай столько задач, сколько действительно нужно проекту, и распредели их по колонкам',
      '  по смыслу: где-то задач может быть больше, где-то меньше — не уравнивай их количество.',
      '- "priority": только "HIGH", "MEDIUM" или "LOW" (заглавными буквами), по важности задачи.',
      '- "color": выбери ОДИН цвет из списка под смысл задачи:',
      '  "#e05555" (красный), "#e08c2a" (оранжевый), "#d4b84a" (жёлтый),',
      '  "#4caf76" (зелёный), "#4a9eff" (синий), "#9c6bda" (фиолетовый).',
      '- "dueInDays": срок выполнения в днях от сегодня, целое число от 1 до 60.',
      '- ОБЯЗАТЕЛЬНО: у КАЖДОЙ задачи массив "subtasks" из 2-4 конкретных подзадач. Пустой "subtasks" ЗАПРЕЩЁН.',
      '- Все тексты — только на русском языке, без слов-заглушек вроде "Task 1".',
      '- НЕ добавляй текст вне JSON, не оборачивай в ```json блоки.',
    ].join('\n');
  }

  private buildUserPrompt(name: string, description: string): string {
    return [
      `Название проекта: ${name}`,
      '',
      'Описание проекта:',
      description || '(описание не предоставлено)',
      '',
      'Помни: все названия задач и подзадач, а также описания — пиши ТОЛЬКО на русском языке.',
    ].join('\n');
  }

  private parseTasksResponse(content: string): GenerateResult {
    let jsonStr = content.trim();

    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace  = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new BadGatewayException('ИИ-сервис не вернул JSON');
    }
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new BadGatewayException('ИИ-сервис вернул некорректный JSON');
    }

    if (!parsed || !Array.isArray(parsed.tasks)) {
      throw new BadGatewayException('ИИ-сервис вернул JSON без поля tasks');
    }

    const allowedPriorities = new Set(['HIGH', 'MEDIUM', 'LOW']);
    const allowedColors     = new Set<string>(TASK_COLORS);

    const columns: string[] = Array.isArray(parsed.columns)
      ? parsed.columns
          .filter((c: any) => typeof c === 'string' && c.trim().length > 0)
          .map((c: any) => c.trim().slice(0, 60))
          .slice(0, 6)
      : [];

    const tasks: GeneratedTask[] = parsed.tasks
      .filter((t: any) => t && typeof t.title === 'string' && t.title.trim().length > 0)
      .map((t: any) => {
        const priority = typeof t.priority === 'string' && allowedPriorities.has(t.priority.toUpperCase())
          ? (t.priority.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW')
          : 'MEDIUM';

        const color = typeof t.color === 'string' && allowedColors.has(t.color.trim().toLowerCase())
          ? t.color.trim().toLowerCase()
          : null;

        let dueInDays: number | null = null;
        const rawDue = Number(t.dueInDays);
        if (Number.isFinite(rawDue) && rawDue > 0) {
          dueInDays = Math.min(365, Math.round(rawDue));
        }

        const column = typeof t.column === 'string' && t.column.trim().length > 0
          ? t.column.trim().slice(0, 60)
          : null;

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
          color,
          dueInDays,
          column,
          subtasks,
        };
      })
      .slice(0, 12);

    if (tasks.length === 0) {
      throw new BadGatewayException('ИИ-сервис не сгенерировал ни одной задачи');
    }

    return { columns, tasks };
  }

  // Используем нативный http вместо fetch: у глобального fetch (undici) есть
  // встроенный таймаут ожидания заголовков ~5 минут, а Ollama при stream:false
  // отдаёт ответ только после полной генерации — на слабом CPU это дольше,
  // и fetch падает с «fetch failed». http даёт только наш таймаут (timeoutMs).
  private httpPostJson(
    url: string,
    bodyObj: unknown,
    timeoutMs: number,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps   = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;
      const payload   = Buffer.from(JSON.stringify(bodyObj), 'utf-8');

      const req = transport.request(
        {
          method:   'POST',
          hostname: parsedUrl.hostname,
          port:     parsedUrl.port || (isHttps ? 443 : 80),
          path:     parsedUrl.pathname + parsedUrl.search,
          headers: {
            'Content-Type':   'application/json',
            'Content-Length': payload.length,
          },
          timeout: timeoutMs,
        },
        (resp) => {
          const chunks: Buffer[] = [];
          resp.on('data', (c: Buffer) => chunks.push(c));
          resp.on('end', () => resolve({
            status: resp.statusCode ?? 0,
            body:   Buffer.concat(chunks).toString('utf-8'),
          }));
        },
      );

      req.on('error',   reject);
      req.on('timeout', () => req.destroy(new Error('Ollama request timed out')));
      req.write(payload);
      req.end();
    });
  }
}
