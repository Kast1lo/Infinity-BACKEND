import { Injectable } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { CreateTaskDto } from './DTO/create-task.dto';
import { UpdateTaskDto } from './DTO/update-task.dto';
import { CreateSubtaskDto } from './DTO/create-subtask.dto';
import { Priority } from 'src/generated/prisma/browser';
import { PlanService } from '../plan/plan.service';

@Injectable()
export class InfinityLifeService {
  constructor(
    private readonly prisma:       PrismaDatabaseService,
    private readonly planService:  PlanService,
  ) {}

  // ─── TASK ───

  async createTask(dto: CreateTaskDto, userId: string) {
    // ─── Проверка лимита задач ───
    await this.planService.checkTaskLimit(userId);

    return this.prisma.task.create({
      data: {
        title:       dto.title,
        notes:       dto.notes,
        priority:    (dto.priority as Priority) || Priority.MEDIUM,
        columnId:    dto.columnId || null,
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
      select: { userId: true },
    });
    if (!task || task.userId !== userId) throw new Error('Задача не найдена или нет доступа');

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

  async moveTaskToColumn(taskId: string, newColumnId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where:  { id: taskId },
      select: { userId: true },
    });
    if (!task || task.userId !== userId) throw new Error('Задача не найдена или нет доступа');

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
    if (!task || task.userId !== userId) throw new Error('Задача не найдена или нет доступа');

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
    if (!task || task.userId !== userId) throw new Error('Задача не найдена или нет доступа');

    return this.prisma.task.delete({ where: { id: taskId } });
  }

  async getUserTasks(userId: string) {
    return this.prisma.task.findMany({
      where:   { userId },
      include: { subtasks: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── SUBTASK ───

  async createSubtask(dto: CreateSubtaskDto, userId: string) {
    const parentTask = await this.prisma.task.findUnique({
      where:  { id: dto.taskId },
      select: { userId: true },
    });
    if (!parentTask || parentTask.userId !== userId) throw new Error('Задача не найдена или нет доступа');

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
    if (!subtask || subtask.task.userId !== userId) throw new Error('Подзадача не найдена или нет доступа');

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
    if (!subtask || subtask.task.userId !== userId) throw new Error('Подзадача не найдена или нет доступа');

    return this.prisma.subtask.delete({ where: { id: subtaskId } });
  }

  // ─── PROGRESS ───

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

  // ─── COLUMNS ───

  async createColumn(dto: { name: string }, userId: string) {
    const maxOrder = await this.prisma.taskColumn.aggregate({
      where: { userId },
      _max:  { order: true },
    });
    return this.prisma.taskColumn.create({
      data: { name: dto.name, userId, order: (maxOrder._max.order || 0) + 1 },
    });
  }

  async getUserColumns(userId: string) {
    return this.prisma.taskColumn.findMany({
      where:   { userId },
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
    const column = await this.prisma.taskColumn.findUnique({ where: { id: columnId } });
    if (!column || column.userId !== userId) throw new Error('Колонка не найдена или нет доступа');

    return this.prisma.taskColumn.update({
      where: { id: columnId },
      data:  { name: dto.name },
    });
  }

  async deleteColumn(columnId: string, userId: string) {
    const column = await this.prisma.taskColumn.findUnique({ where: { id: columnId } });
    if (!column || column.userId !== userId) throw new Error('Колонка не найдена или нет доступа');

    await this.prisma.subtask.deleteMany({ where: { task: { columnId } } });
    await this.prisma.task.deleteMany({ where: { columnId } });
    return this.prisma.taskColumn.delete({ where: { id: columnId } });
  }
}