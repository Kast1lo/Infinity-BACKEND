import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaDatabaseService } from '../prisma-database/prisma-database.service';
import { CreateCalendarTaskDto, UpdateCalendarTaskDto } from './DTO/calendar.dto';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaDatabaseService) {}

  // 'YYYY-MM-DD' → Date в UTC-полночь (для колонок @db.Date).
  private parseDate(s: string): Date {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new BadRequestException('Некорректная дата');
    return d;
  }

  // Date → 'YYYY-MM-DD' (UTC).
  private toStr(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // Данные за месяц: датированные мини-заметки + задачи дня (для бейджей сетки).
  async getMonth(userId: string, year: number, month: number) {
    if (!year || !month || month < 1 || month > 12) {
      throw new BadRequestException('Некорректный месяц');
    }
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end   = new Date(Date.UTC(year, month, 1));

    const [notes, tasks] = await Promise.all([
      this.prisma.note.findMany({
        where:  { userId, date: { gte: start, lt: end } },
        select: { id: true, date: true, content: true },
      }),
      this.prisma.calendarTask.findMany({
        where:   { userId, date: { gte: start, lt: end } },
        orderBy: [{ date: 'asc' }, { order: 'asc' }],
      }),
    ]);

    return {
      notes: notes.map(n => ({ id: n.id, date: this.toStr(n.date!), content: n.content })),
      tasks: tasks.map(t => ({
        id: t.id, date: this.toStr(t.date), title: t.title,
        isCompleted: t.isCompleted, order: t.order,
      })),
    };
  }

  // Данные одного дня: мини-заметка + задачи.
  async getDay(userId: string, dateStr: string) {
    const date = this.parseDate(dateStr);
    const [note, tasks] = await Promise.all([
      this.prisma.note.findFirst({
        where:  { userId, date },
        select: { id: true, content: true },
      }),
      this.prisma.calendarTask.findMany({
        where:   { userId, date },
        orderBy: { order: 'asc' },
      }),
    ]);
    return {
      note,
      tasks: tasks.map(t => ({ id: t.id, title: t.title, isCompleted: t.isCompleted, order: t.order })),
    };
  }

  // Upsert мини-заметки дня. Пустой content → удаляем заметку.
  async upsertNote(userId: string, dateStr: string, content: string) {
    const date = this.parseDate(dateStr);
    const existing = await this.prisma.note.findFirst({ where: { userId, date } });

    const isEmpty = !content || content.replace(/<[^>]*>/g, '').trim().length === 0;

    if (existing) {
      if (isEmpty) {
        await this.prisma.note.delete({ where: { id: existing.id } });
        return { note: null };
      }
      const note = await this.prisma.note.update({ where: { id: existing.id }, data: { content } });
      return { note: { id: note.id, content: note.content } };
    }

    if (isEmpty) return { note: null };
    const note = await this.prisma.note.create({ data: { userId, date, content } });
    return { note: { id: note.id, content: note.content } };
  }

  async createTask(userId: string, dto: CreateCalendarTaskDto) {
    const date = this.parseDate(dto.date);
    const count = await this.prisma.calendarTask.count({ where: { userId, date } });
    const task = await this.prisma.calendarTask.create({
      data: { userId, date, title: dto.title, order: count },
    });
    return { id: task.id, title: task.title, isCompleted: task.isCompleted, order: task.order };
  }

  async updateTask(userId: string, id: string, dto: UpdateCalendarTaskDto) {
    const task = await this.prisma.calendarTask.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('Задача не найдена');
    const updated = await this.prisma.calendarTask.update({
      where: { id },
      data: {
        ...(dto.title       !== undefined && { title: dto.title }),
        ...(dto.isCompleted !== undefined && { isCompleted: dto.isCompleted }),
      },
    });
    return { id: updated.id, title: updated.title, isCompleted: updated.isCompleted, order: updated.order };
  }

  async deleteTask(userId: string, id: string) {
    const task = await this.prisma.calendarTask.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException('Задача не найдена');
    await this.prisma.calendarTask.delete({ where: { id } });
    return { success: true };
  }
}
