import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { PlanService } from 'src/plan/plan.service';
import { GigachatService } from 'src/gigachat/gigachat.service';
import { Priority } from 'src/generated/prisma/browser';
import { CreateProjectDto } from './DTO/create-project.dto';
import { UpdateProjectDto } from './DTO/update-project.dto';
import { AiGenerateTasksDto } from './DTO/ai-generate-tasks.dto';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma:          PrismaDatabaseService,
    private readonly planService:     PlanService,
    private readonly gigachatService: GigachatService,
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
      include: { columns: { orderBy: { order: 'asc' }, select: { id: true, name: true } } },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (project.userId !== userId) throw new ForbiddenException('Нет доступа к этому проекту');

    await this.planService.checkTaskLimit(userId);
    const usage = await this.planService.checkAndIncrementAiCalls(userId);

    const generated = await this.gigachatService.generateTasksFromDescription(
      dto.name ?? project.name,
      dto.description,
      project.columns.map(c => c.name),
    );

    const includeSubtasks = dto.includeSubtasks !== false;
    const defaultColumnId = project.columns[0]?.id ?? null;

    const startOrder = await this.prisma.task.aggregate({
      where: { projectId },
      _max:  { order: true },
    });
    let nextOrder = (startOrder._max.order ?? 0) + 1;

    const createdTasks: any[] = [];

    for (const t of generated.tasks) {
      const created = await this.prisma.task.create({
        data: {
          title:     t.title,
          notes:     t.notes,
          priority:  t.priority as Priority,
          projectId,
          columnId:  defaultColumnId,
          userId,
          order:     nextOrder++,
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
}
