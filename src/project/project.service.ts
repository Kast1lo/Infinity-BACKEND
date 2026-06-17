import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { PlanService } from 'src/plan/plan.service';
import { OllamaService } from 'src/ollama/ollama.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { StorageService } from 'src/services/files.service';
import { Priority } from 'src/generated/prisma/browser';
import { CreateProjectDto } from './DTO/create-project.dto';
import { UpdateProjectDto } from './DTO/update-project.dto';
import { AiGenerateTasksDto } from './DTO/ai-generate-tasks.dto';

export type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';
const ROLE_RANK: Record<ProjectRole, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma:          PrismaDatabaseService,
    private readonly planService:     PlanService,
    private readonly ollamaService:   OllamaService,
    private readonly notifications:   NotificationsService,
    private readonly storage:         StorageService,
  ) {}

  // ─── Доступ (владелец или участник с ролью) ───

  async getEffectiveRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    if (!projectId) return null;
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!project) return null;
    if (project.userId === userId) return 'OWNER';
    const share = await this.prisma.projectShare.findUnique({
      where:  { projectId_userId: { projectId, userId } },
      select: { role: true, status: true },
    });
    if (!share || share.status !== 'ACCEPTED') return null;
    return (share.role as ProjectRole) ?? 'VIEWER';
  }

  // Бросает 404/403, если доступа нет или роль ниже требуемой. Возвращает эффективную роль.
  async assertAccess(projectId: string, userId: string, min: ProjectRole = 'VIEWER'): Promise<ProjectRole> {
    if (!projectId) throw new NotFoundException('Проект не найден');
    const role = await this.getEffectiveRole(projectId, userId);
    if (!role) {
      const exists = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Проект не найден');
      throw new ForbiddenException('Нет доступа к этому проекту');
    }
    if (ROLE_RANK[role] < ROLE_RANK[min]) throw new ForbiddenException('Недостаточно прав для этого действия');
    return role;
  }

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
    const [owned, shared] = await Promise.all([
      this.prisma.project.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { tasks: true, columns: true } } },
      }),
      this.prisma.projectShare.findMany({
        where:   { userId, status: 'ACCEPTED' },
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            include: {
              _count: { select: { tasks: true, columns: true } },
              user:   { select: { username: true, email: true } },
            },
          },
        },
      }),
    ]);

    const ownedMapped = owned.map(p => ({ ...p, shared: false, role: 'OWNER' as const, ownerName: null as string | null }));
    const sharedMapped = shared
      .filter(s => s.project)
      .map(s => ({
        ...s.project,
        shared:    true,
        role:      s.role,
        ownerName: s.project.user?.username ?? s.project.user?.email ?? null,
      }));

    return [...ownedMapped, ...sharedMapped];
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

    const role = await this.getEffectiveRole(projectId, userId);
    if (!role) throw new ForbiddenException('Нет доступа к этому проекту');

    return { ...project, myRole: role, isOwner: role === 'OWNER' };
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
    await this.assertAccess(projectId, userId, 'EDITOR');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { columns: { orderBy: { order: 'asc' }, select: { id: true, name: true, order: true } } },
    });
    if (!project) throw new NotFoundException('Проект не найден');

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

  // ─── Участники доски ───

  private normalizeRole(role?: string): 'VIEWER' | 'EDITOR' {
    return role === 'VIEWER' ? 'VIEWER' : 'EDITOR';
  }

  private async avatarUrl(avatarKey?: string | null): Promise<string | null> {
    if (!avatarKey) return null;
    return this.storage.getPresignedUrl(avatarKey, 3600 * 24).catch(() => null);
  }

  async listMembers(projectId: string, userId: string) {
    await this.assertAccess(projectId, userId, 'VIEWER');

    const project = await this.prisma.project.findUnique({
      where:   { id: projectId },
      select:  { userId: true, user: { select: { id: true, username: true, email: true, avatarKey: true } } },
    });
    if (!project) throw new NotFoundException('Проект не найден');

    const shares = await this.prisma.projectShare.findMany({
      where:   { projectId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, username: true, email: true, avatarKey: true } } },
    });

    const owner = {
      userId:    project.user!.id,
      username:  project.user!.username,
      email:     project.user!.email,
      avatarUrl: await this.avatarUrl(project.user!.avatarKey),
      role:      'OWNER' as const,
      isOwner:   true,
    };
    const members = await Promise.all(shares.map(async s => ({
      userId:    s.user.id,
      username:  s.user.username,
      email:     s.user.email,
      avatarUrl: await this.avatarUrl(s.user.avatarKey),
      role:      s.role,
      isOwner:   false,
    })));

    return [owner, ...members];
  }

  async inviteMember(ownerId: string, projectId: string, email: string, role?: string) {
    await this.assertOwnership(projectId, ownerId);

    const normalizedEmail = email.trim().toLowerCase();
    const invitee = await this.prisma.user.findUnique({
      where:  { email: normalizedEmail },
      select: { id: true, username: true, email: true },
    });
    if (!invitee) throw new NotFoundException('Пользователь с таким email не найден');
    if (invitee.id === ownerId) throw new BadRequestException('Вы уже владелец этой доски');

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    const finalRole = this.normalizeRole(role);

    const share = await this.prisma.projectShare.upsert({
      where:  { projectId_userId: { projectId, userId: invitee.id } },
      update: { role: finalRole, status: 'ACCEPTED' },
      create: { projectId, userId: invitee.id, role: finalRole, status: 'ACCEPTED', invitedById: ownerId },
      include: { user: { select: { id: true, username: true, email: true } } },
    });

    await this.notifications.create(invitee.id, {
      type:  'share',
      title: 'Доступ к доске',
      body:  `Вам открыли доступ к доске «${project?.name ?? ''}»`,
      link:  `/projects/${projectId}`,
    });

    return {
      userId:   share.user.id,
      username: share.user.username,
      email:    share.user.email,
      role:     share.role,
      isOwner:  false,
    };
  }

  async updateMemberRole(ownerId: string, projectId: string, memberUserId: string, role: string) {
    await this.assertOwnership(projectId, ownerId);
    const finalRole = this.normalizeRole(role);
    const share = await this.prisma.projectShare.findUnique({
      where: { projectId_userId: { projectId, userId: memberUserId } },
    });
    if (!share) throw new NotFoundException('Участник не найден');
    await this.prisma.projectShare.update({
      where: { projectId_userId: { projectId, userId: memberUserId } },
      data:  { role: finalRole },
    });
    return { userId: memberUserId, role: finalRole };
  }

  async removeMember(ownerId: string, projectId: string, memberUserId: string) {
    await this.assertOwnership(projectId, ownerId);
    await this.prisma.projectShare.deleteMany({ where: { projectId, userId: memberUserId } });
    return { message: 'Участник удалён' };
  }

  async leaveProject(userId: string, projectId: string) {
    const deleted = await this.prisma.projectShare.deleteMany({ where: { projectId, userId } });
    if (deleted.count === 0) throw new NotFoundException('Вы не участник этой доски');
    return { message: 'Вы покинули доску' };
  }

  private colorByPriority(priority: 'HIGH' | 'MEDIUM' | 'LOW'): string {
    switch (priority) {
      case 'HIGH':   return '#e05555'; // красный
      case 'MEDIUM': return '#e08c2a'; // оранжевый
      default:       return '#4caf76'; // зелёный
    }
  }
}
