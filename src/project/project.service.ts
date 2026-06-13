import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { PlanService } from 'src/plan/plan.service';
import { OllamaService } from 'src/ollama/ollama.service';
import { Priority } from 'src/generated/prisma/browser';
import { CreateProjectDto } from './DTO/create-project.dto';
import { UpdateProjectDto } from './DTO/update-project.dto';
import { AiGenerateTasksDto } from './DTO/ai-generate-tasks.dto';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma:          PrismaDatabaseService,
    private readonly planService:     PlanService,
    private readonly ollamaService: OllamaService,
  ) {}

  async createProject(dto: CreateProjectDto, userId: string) {
    await this.planService.checkProjectLimit(userId);

    return this.prisma.project.create({
      data: {
        name:        dto.name,
        description: dto.description ?? null,
        color:       dto.color ?? null,
        icon:        dto.icon ?? null,
        userId,
      },
    });
  }

  async getUserProjects(userId: string) {
    return this.prisma.project.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tasks: true, columns: true } },
      },
    });
  }

  async getProjectById(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        columns: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' },
              include: { subtasks: { orderBy: { order: 'asc' } } },
            },
          },
        },
        tasks: {
          where:   { columnId: null },
          orderBy: { order: 'asc' },
          include: { subtasks: { orderBy: { order: 'asc' } } },
        },
      },
    });

    if (!project) throw new NotFoundException('Проект не найден');
    if (project.userId !== userId) throw new ForbiddenException('Нет доступа к этому проекту');

    return project;
  }

  async updateProject(projectId: string, dto: UpdateProjectDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where:  { id: projectId },
      select: { userId: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (project.userId !== userId) throw new ForbiddenException('Нет доступа к этому проекту');

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.name        !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color       !== undefined && { color: dto.color }),
        ...(dto.icon        !== undefined && { icon: dto.icon }),
      },
    });
  }

  async deleteProject(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where:  { id: projectId },
      select: { userId: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (project.userId !== userId) throw new ForbiddenException('Нет доступа к этому проекту');

    return this.prisma.project.delete({ where: { id: projectId } });
  }

  async assertOwnership(projectId: string, userId: string): Promise<void> {
    if (!projectId) throw new NotFoundException('Проект не найден');
    const project = await this.prisma.project.findUnique({
      where:  { id: projectId },
      select: { userId: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (project.userId !== userId) throw new ForbiddenException('Нет доступа к этому проекту');
  }

  async generateTasksWithAi(projectId: string, dto: AiGenerateTasksDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { columns: { orderBy: { order: 'asc' }, select: { id: true, name: true, order: true } } },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (project.userId !== userId) throw new ForbiddenException('Нет доступа к этому проекту');

    await this.planService.checkTaskLimit(userId);
    const usage = await this.planService.checkAndIncrementAiCalls(userId);

    // Передаём пустой список колонок — каждая генерация предлагает свои новые
    // колонки-этапы, а не раскладывает задачи по уже существующим.
    const generated = await this.ollamaService.generateTasksFromDescription(
      dto.name ?? project.name,
      dto.description,
      [],
    );

    // Генерация занимает заметное время (десятки секунд), за которые пользователь
    // мог удалить проект. Перепроверяем существование перед записью, иначе
    // получим грубую ошибку внешнего ключа при создании колонок/задач.
    const stillExists = await this.prisma.project.findUnique({
      where:  { id: projectId },
      select: { id: true },
    });
    if (!stillExists) {
      throw new NotFoundException('Проект был удалён во время генерации задач');
    }

    const includeSubtasks = dto.includeSubtasks !== false;

    // Всегда создаём НОВЫЕ колонки из предложенных ИИ (добавляются после
    // существующих). Сопоставление "имя колонки (lowercase) -> id".
    const columnMap = new Map<string, string>();

    const names = generated.columns.length > 0
      ? generated.columns
      : ['К выполнению', 'В работе', 'Готово'];

    let order = project.columns.length > 0
      ? Math.max(...project.columns.map(c => c.order)) + 1
      : 0;

    for (const name of names) {
      const created = await this.prisma.taskColumn.create({
        data:   { name, order: order++, projectId },
        select: { id: true, name: true },
      });
      columnMap.set(created.name.trim().toLowerCase(), created.id);
    }

    const fallbackColumnId = [...columnMap.values()][0];

    // Новые колонки пусты — порядок задач в каждой начинается с нуля.
    const orderByColumn = new Map<string, number>();

    const createdTasks: any[] = [];

    for (const t of generated.tasks) {
      const columnId = (t.column && columnMap.get(t.column.trim().toLowerCase())) || fallbackColumnId;
      const color    = t.color ?? this.colorByPriority(t.priority);
      const dueDate  = t.dueInDays
        ? new Date(Date.now() + t.dueInDays * 86_400_000)
        : null;

      const order = orderByColumn.get(columnId) ?? 0;
      orderByColumn.set(columnId, order + 1);

      const created = await this.prisma.task.create({
        data: {
          title:    t.title,
          notes:    t.notes,
          priority: t.priority as Priority,
          color,
          dueDate,
          projectId,
          columnId,
          userId,
          order,
          subtasks: includeSubtasks
            ? {
                create: t.subtasks.map((s, idx) => ({
                  title: s.title,
                  order: idx,
                })),
              }
            : undefined,
        },
        include: { subtasks: { orderBy: { order: 'asc' } } },
      });
      createdTasks.push(created);
    }

    return {
      tasks: createdTasks,
      aiUsage: {
        used:  usage.used,
        limit: usage.limit,
      },
    };
  }

  private colorByPriority(priority: 'HIGH' | 'MEDIUM' | 'LOW'): string {
    switch (priority) {
      case 'HIGH':   return '#e05555'; // красный
      case 'MEDIUM': return '#e08c2a'; // оранжевый
      default:       return '#4caf76'; // зелёный
    }
  }
}
