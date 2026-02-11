import { Injectable } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { CreateTaskDto } from './DTO/create-task.dto';
import { UpdateTaskDto } from './DTO/update-task.dto';

@Injectable()
export class InfinityLifeService {
    constructor(
        private readonly prisma: PrismaDatabaseService
    ) {}

    async createTask(dto: CreateTaskDto, userId: string) {
        if(dto.parentId) {
            const parent = await this.prisma.task.findUnique({
                where: { id: dto.parentId },
                select: { userId: true },
            });
            if(!parent) throw new Error('Родительская задача не найдена');
            if(parent.userId !== userId) throw new Error('Нет доступа к родительской задаче');
        }
        return this.prisma.task.create({
            data: {
                title: dto.title,
                priority: dto.priority,
                notes: dto.notes,
                isCompleted: dto.isCompleted,
                parentId: dto.parentId,
                userId: userId,
            },
        }); 
    }

    async updateTask(userId: string, dto: UpdateTaskDto, taskId: string) {
        const existingTask = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: { userId: true },
        });
        if(!existingTask) throw new Error('Задача не найдена');
        if(existingTask.userId !== userId) throw new Error('Нет доступа к этой задаче');
        return this.prisma.task.update({
            where: { id: taskId },
            data: {
                title: dto.title,
                priority: dto.priority,
                notes: dto.notes,
                isCompleted: dto.isCompleted,
                parentId: dto.parentId,
            },
        });
    }

    async ToggleTaskCompletion(userId: string, taskId: string) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: { userId: true, isCompleted: true },
        });
        if(!task) throw new Error('Задача не найдена');
        if(task.userId !== userId) throw new Error('Нет доступа к этой задаче');
        const newStatus = !task.isCompleted;
        const updatedTask = await this.prisma.task.update({
            where: { id: taskId },
            data: { isCompleted: newStatus },
            include: { 
                parent: {select:{id: true, title: true}}
            },
        });
        return updatedTask;
    }

    async getAllTasks(userId: string) {
        const rootTasks = await this.prisma.task.findMany({
            where: {
                userId,
                parentId: null,           
            },
            include: {
                subtasks: {
                include: {
                    subtasks: {
                    include: {
                        subtasks: true,
                    },
                    },
                },
                orderBy: [
                    { priority: 'desc' },
                    { createdAt: 'desc' },
                ],
                },
            },
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' },
            ],
        });
        const tasksWithProgress = this.addProgressToTree(rootTasks);
        return tasksWithProgress;
    }
    private addProgressToTree(tasks: any[]): any[] {
        return tasks.map(task => {
        const progress = this.calculateProgress(task);
        let enrichedSubtasks = task.subtasks || [];
        if (enrichedSubtasks.length > 0) {
            enrichedSubtasks = this.addProgressToTree(enrichedSubtasks);
        }
        return {
            ...task,
            progress,
            subtasks: enrichedSubtasks,
        };
        });
    }
    private calculateProgress(task: any): number {
        if (!task.subtasks || task.subtasks.length === 0) {
        return task.isCompleted ? 100 : 0;
        }
        const total = task.subtasks.length;
        const completed = task.subtasks.filter((sub: any) => sub.isCompleted).length;
        return total > 0 ? Math.round((completed / total) * 100) : 0;
    }

    async deleteTask(userId: string, taskId: string) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: { 
                userId: true,
                parentId: true,
            },
        });
        if(!task) throw new Error('Задача не найдена');
        if(task.userId !== userId) throw new Error('Нет доступа к этой задаче');
        await this.prisma.task.delete({
            where: { id: taskId },
        });
        return { message: 'Задача удалена', deletedTaskId: taskId };
    }
}
