import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { CreateTaskDto } from './DTO/create-task.dto';
import { UpdateTaskDto } from './DTO/update-task.dto';
import { CreateSubtaskDto } from './DTO/create-subtask.dto';
import { Priority } from 'src/generated/prisma/browser';
import { PlanService } from '../plan/plan.service';
import { ProjectService } from '../project/project.service';

@Injectable()
export class InfinityLifeService {
  constructor(
    private readonly prisma:          PrismaDatabaseService,
    private readonly planService:     PlanService,
    private readonly projectService:  ProjectService,
  ) {}

  async createTask(dto: CreateTaskDto, userId: string) {
    await this.projectService.assertOwnership(dto.projectId, userId);
    await this.planService.checkTaskLimit(userId);

    if (dto.columnId) {
      await this.assertColumnInProject(dto.columnId, dto.projectId);
    }

    return this.prisma.task.create({
      data: {
        title:       dto.title,
        notes:       dto.notes,
        priority:    (dto.priority as Priority) || Priority.MEDIUM,
        columnId:    dto.columnId || null,
        projectId:   dto.projectId,
        userId,
        isCompleted: false,
        dueDate:     dto.dueDate ? new Date(dto.dueDate) : null,
        color:       dto.color || null,
      },
      include: { subtasks: true },
    });
  }

  async updateTask(taskId: string, dto: UpdateTaskDto, userId: string) {
    const task = await this.prisma.task.findUnique({
      where:  { id: taskId },
      select: { userId: true, projectId: true },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (task.userId !== userId) throw new ForbiddenException('Нет доступа к этой задаче');

    if (dto.columnId) {
      await this.assertColumnInProject(dto.columnId, task.projectId);
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(dto.title       !== undefined && { title: dto.title }),
        ...(dto.notes       !== undefined && { notes: dto.notes }),
        ...(dto.priority    !== undefined && { priority: dto.priority as Priority }),
        ...(dto.isCompleted !== undefined && { isCompleted: dto.isCompleted }),
        ...(dto.columnId    !== undefined && { columnId: dto.columnId }),
        ...(dto.dueDate     !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.color       !== undefined && { color: dto.color }),
      },
      include: { subtasks: true },
    });
  }

  async moveTaskToColumn(taskId: string, newColumnId: string | null, userId: string) {
    const task = await this.prisma.task.findUnique({
      where:  { id: taskId },
      select: { userId: true, projectId: true },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (task.userId !== userId) throw new ForbiddenException('Нет доступа к этой задаче');

    if (newColumnId !== null) {
      await this.assertColumnInProject(newColumnId, task.projectId);
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data:  { columnId: newColumnId },
    });
  }

  async toggleTaskCompletion(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where:  { id: taskId },
      select: { userId: true, isCompleted: true },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (task.userId !== userId) throw new ForbiddenException('Нет доступа к этой задаче');

    return this.prisma.task.update({
      where:   { id: taskId },
      data:    { isCompleted: !task.isCompleted },
      include: { subtasks: true },
    });
  }

  async deleteTask(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where:  { id: taskId },
      select: { userId: true },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (task.userId !== userId) throw new ForbiddenException('Нет доступа к этой задаче');

    return this.prisma.task.delete({ where: { id: taskId } });
  }

  async getUserTasks(userId: string) {
    return this.prisma.task.findMany({
      where:   { userId },
      include: { subtasks: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Напоминания: незавершённые задачи с дедлайном
  // (просроченные за последние 14 дней или с дедлайном в ближайшие 7 дней).
  // Древняя просрочка не показывается, чтобы колокольчик не висел бесконечно.
  async getReminders(userId: string) {
    const now   = new Date();
    const soon  = new Date(now.getTime() + 7 * 86_400_000);
    const since = new Date(now.getTime() - 14 * 86_400_000);

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        isCompleted: false,
        dueDate: { gte: since, lte: soon },
        OR: [
          { reminderSnoozedUntil: null },
          { reminderSnoozedUntil: { lte: now } },
        ],
      },
      select: {
        id:       true,
        title:    true,
        dueDate:  true,
        priority: true,
        projectId: true,
        project:  { select: { name: true, color: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
    });

    return tasks.map((t) => ({
      id:          t.id,
      title:       t.title,
      dueDate:     t.dueDate,
      priority:    t.priority,
      projectId:   t.projectId,
      projectName: t.project?.name ?? '',
      projectColor: t.project?.color ?? null,
      isOverdue:   !!t.dueDate && t.dueDate.getTime() < now.getTime(),
    }));
  }

  // Отложить напоминание: скрыть его из колокольчика на указанное число дней.
  async snoozeReminder(userId: string, taskId: string, days: number) {
    const task = await this.prisma.task.findUnique({
      where:  { id: taskId },
      select: { userId: true },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (task.userId !== userId) throw new ForbiddenException('Нет доступа к этой задаче');

    const until = new Date(Date.now() + days * 86_400_000);
    await this.prisma.task.update({
      where: { id: taskId },
      data:  { reminderSnoozedUntil: until },
    });
    return { snoozedUntil: until };
  }

  async createSubtask(dto: CreateSubtaskDto, userId: string) {
    const parentTask = await this.prisma.task.findUnique({
      where:  { id: dto.taskId },
      select: { userId: true },
    });
    if (!parentTask) throw new NotFoundException('Задача не найдена');
    if (parentTask.userId !== userId) throw new ForbiddenException('Нет доступа к этой задаче');

    const subtaskCount = await this.prisma.subtask.count({ where: { taskId: dto.taskId } });

    return this.prisma.subtask.create({
      data: { title: dto.title, taskId: dto.taskId, order: subtaskCount },
    });
  }

  async toggleSubtaskCompletion(subtaskId: string, userId: string) {
    const subtask = await this.prisma.subtask.findUnique({
      where:   { id: subtaskId },
      include: { task: true },
    });
    if (!subtask) throw new NotFoundException('Подзадача не найдена');
    if (subtask.task.userId !== userId) throw new ForbiddenException('Нет доступа к этой подзадаче');

    const updatedSubtask = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data:  { isCompleted: !subtask.isCompleted },
    });

    const progress = await this.calculateTaskProgress(subtask.taskId);
    return { subtask: updatedSubtask, taskId: subtask.taskId, progress };
  }

  async deleteSubtask(subtaskId: string, userId: string) {
    const subtask = await this.prisma.subtask.findUnique({
      where:   { id: subtaskId },
      include: { task: true },
    });
    if (!subtask) throw new NotFoundException('Подзадача не найдена');
    if (subtask.task.userId !== userId) throw new ForbiddenException('Нет доступа к этой подзадаче');

    return this.prisma.subtask.delete({ where: { id: subtaskId } });
  }

  async calculateTaskProgress(taskId: string): Promise<number> {
    const subtasks = await this.prisma.subtask.findMany({
      where:  { taskId },
      select: { isCompleted: true },
    });
    if (subtasks.length === 0) return 0;
    const completed = subtasks.filter(s => s.isCompleted).length;
    return Math.round((completed / subtasks.length) * 100);
  }

  async getTaskWithProgress(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where:   { id: taskId },
      include: { subtasks: { orderBy: { order: 'asc' } } },
    });
    if (!task) return null;
    const progress = await this.calculateTaskProgress(taskId);
    return { ...task, progress };
  }

  async createColumn(dto: { projectId: string; name: string }, userId: string) {
    await this.projectService.assertOwnership(dto.projectId, userId);

    const maxOrder = await this.prisma.taskColumn.aggregate({
      where: { projectId: dto.projectId },
      _max:  { order: true },
    });

    return this.prisma.taskColumn.create({
      data: {
        name:      dto.name,
        projectId: dto.projectId,
        order:     (maxOrder._max.order || 0) + 1,
      },
    });
  }

  async getProjectColumns(projectId: string, userId: string) {
    if (!projectId) throw new BadRequestException('Не указан проект (projectId)');
    await this.projectService.assertOwnership(projectId, userId);

    return this.prisma.taskColumn.findMany({
      where:   { projectId },
      include: {
        tasks: {
          include: { subtasks: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });
  }

  async updateColumn(columnId: string, dto: { name: string }, userId: string) {
    const column = await this.prisma.taskColumn.findUnique({
      where:   { id: columnId },
      include: { project: { select: { userId: true } } },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');
    if (column.project.userId !== userId) throw new ForbiddenException('Нет доступа к этой колонке');

    return this.prisma.taskColumn.update({
      where: { id: columnId },
      data:  { name: dto.name },
    });
  }

  async deleteColumn(columnId: string, userId: string) {
    const column = await this.prisma.taskColumn.findUnique({
      where:   { id: columnId },
      include: { project: { select: { userId: true } } },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');
    if (column.project.userId !== userId) throw new ForbiddenException('Нет доступа к этой колонке');

    await this.prisma.subtask.deleteMany({ where: { task: { columnId } } });
    await this.prisma.task.deleteMany({ where: { columnId } });
    return this.prisma.taskColumn.delete({ where: { id: columnId } });
  }

  private async assertColumnInProject(columnId: string, projectId: string): Promise<void> {
    const column = await this.prisma.taskColumn.findUnique({
      where:  { id: columnId },
      select: { projectId: true },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');
    if (column.projectId !== projectId) {
      throw new BadRequestException('Колонка не принадлежит этому проекту');
    }
  }
}
