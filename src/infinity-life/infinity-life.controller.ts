import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InfinityLifeService } from './infinity-life.service';
import { CreateTaskDto } from './DTO/create-task.dto';
import { UpdateTaskDto } from './DTO/update-task.dto';
import { CreateSubtaskDto } from './DTO/create-subtask.dto';
import { UpdateSubtaskDto } from './DTO/update-subtask.dto';
import { CreateColumnDto } from './DTO/create-column.dto';
import { UpdateColumnDto } from './DTO/update-column.dto';
import { MoveTaskDto } from './DTO/move-task.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiCookieAuth,
} from '@nestjs/swagger';

@ApiTags('Infinity Life')
@ApiCookieAuth('access_token')
@Controller('infinity-life')
export class InfinityLifeController {
  constructor(private readonly infinityLifeService: InfinityLifeService) {}

  @ApiOperation({ summary: 'Создать задачу' })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({
    status: 201, description: 'Задача создана',
    schema: {
      example: {
        id: 'uuid', title: 'Новая задача', notes: null, priority: 'HIGH',
        isCompleted: false, dueDate: null, color: '#FF5733', order: 0,
        columnId: null, userId: 'uuid', createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z', subtasks: [],
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Превышен лимит задач для плана Spark' })
  @Post('tasks')
  @UseGuards(AuthGuard('jwt'))
  async createTask(@Req() req, @Body() dto: CreateTaskDto) {
    return this.infinityLifeService.createTask(dto, req.user.userId);
  }

  @ApiOperation({ summary: 'Обновить задачу' })
  @ApiParam({ name: 'taskId', description: 'UUID задачи' })
  @ApiBody({ type: UpdateTaskDto })
  @ApiResponse({ status: 200, description: 'Задача обновлена' })
  @ApiResponse({ status: 404, description: 'Задача не найдена' })
  @Patch('tasks/:taskId')
  @UseGuards(AuthGuard('jwt'))
  async updateTask(@Req() req, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.infinityLifeService.updateTask(taskId, dto, req.user.userId);
  }

  @ApiOperation({ summary: 'Переключить статус выполнения задачи' })
  @ApiParam({ name: 'taskId', description: 'UUID задачи' })
  @ApiResponse({ status: 200, description: 'Статус переключён', schema: { example: { id: 'uuid', isCompleted: true } } })
  @Patch('tasks/:taskId/toggle')
  @UseGuards(AuthGuard('jwt'))
  async toggleTaskCompletion(@Req() req, @Param('taskId') taskId: string) {
    return this.infinityLifeService.toggleTaskCompletion(taskId, req.user.userId);
  }

  @ApiOperation({ summary: 'Удалить задачу (вместе с подзадачами)' })
  @ApiParam({ name: 'taskId', description: 'UUID задачи' })
  @ApiResponse({ status: 200, description: 'Задача удалена' })
  @Delete('tasks/:taskId')
  @UseGuards(AuthGuard('jwt'))
  async deleteTask(@Req() req, @Param('taskId') taskId: string) {
    return this.infinityLifeService.deleteTask(taskId, req.user.userId);
  }

  @ApiOperation({ summary: 'Получить все задачи пользователя' })
  @ApiResponse({ status: 200, description: 'Список задач с подзадачами' })
  @Get('tasks')
  @UseGuards(AuthGuard('jwt'))
  async getUserTasks(@Req() req) {
    return this.infinityLifeService.getUserTasks(req.user.userId);
  }

  @ApiOperation({ summary: 'Переместить задачу в колонку' })
  @ApiParam({ name: 'taskId', description: 'UUID задачи' })
  @ApiBody({ type: MoveTaskDto })
  @ApiResponse({ status: 200, description: 'Задача перемещена' })
  @Patch('tasks/:taskId/move')
  @UseGuards(AuthGuard('jwt'))
  async moveTaskToColumn(
    @Req() req,
    @Param('taskId') taskId: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.infinityLifeService.moveTaskToColumn(taskId, dto.columnId, req.user.userId);
  }

  @ApiOperation({ summary: 'Создать подзадачу' })
  @ApiBody({ type: CreateSubtaskDto })
  @ApiResponse({
    status: 201, description: 'Подзадача создана',
    schema: { example: { id: 'uuid', title: 'Написать тесты', isCompleted: false, order: 0, taskId: 'uuid' } },
  })
  @Post('subtasks')
  @UseGuards(AuthGuard('jwt'))
  async createSubtask(@Req() req, @Body() dto: CreateSubtaskDto) {
    return this.infinityLifeService.createSubtask(dto, req.user.userId);
  }

  @ApiOperation({ summary: 'Переключить статус выполнения подзадачи' })
  @ApiParam({ name: 'subtaskId', description: 'UUID подзадачи' })
  @ApiResponse({ status: 200, description: 'Статус переключён' })
  @Patch('subtasks/:subtaskId/toggle')
  @UseGuards(AuthGuard('jwt'))
  async toggleSubtaskCompletion(@Req() req, @Param('subtaskId') subtaskId: string) {
    return this.infinityLifeService.toggleSubtaskCompletion(subtaskId, req.user.userId);
  }

  @ApiOperation({ summary: 'Удалить подзадачу' })
  @ApiParam({ name: 'subtaskId', description: 'UUID подзадачи' })
  @ApiResponse({ status: 200, description: 'Подзадача удалена' })
  @Delete('subtasks/:subtaskId')
  @UseGuards(AuthGuard('jwt'))
  async deleteSubtask(@Req() req, @Param('subtaskId') subtaskId: string) {
    return this.infinityLifeService.deleteSubtask(subtaskId, req.user.userId);
  }

  @ApiOperation({ summary: 'Создать колонку Kanban-доски' })
  @ApiBody({ type: CreateColumnDto })
  @ApiResponse({
    status: 201, description: 'Колонка создана',
    schema: { example: { id: 'uuid', name: 'В работе', order: 0, userId: 'uuid' } },
  })
  @Post('columns')
  @UseGuards(AuthGuard('jwt'))
  async createColumn(@Req() req, @Body() dto: CreateColumnDto) {
    return this.infinityLifeService.createColumn(dto, req.user.userId);
  }

  @ApiOperation({ summary: 'Получить все колонки пользователя' })
  @ApiResponse({ status: 200, description: 'Список колонок' })
  @Get('columns')
  @UseGuards(AuthGuard('jwt'))
  async getUserColumns(@Req() req) {
    return this.infinityLifeService.getUserColumns(req.user.userId);
  }

  @ApiOperation({ summary: 'Переименовать колонку' })
  @ApiParam({ name: 'columnId', description: 'UUID колонки' })
  @ApiBody({ type: UpdateColumnDto })
  @ApiResponse({ status: 200, description: 'Колонка обновлена' })
  @Patch('columns/:columnId')
  @UseGuards(AuthGuard('jwt'))
  async updateColumn(@Req() req, @Param('columnId') columnId: string, @Body() dto: UpdateColumnDto) {
    return this.infinityLifeService.updateColumn(columnId, dto, req.user.userId);
  }

  @ApiOperation({ summary: 'Удалить колонку (задачи становятся без колонки)' })
  @ApiParam({ name: 'columnId', description: 'UUID колонки' })
  @ApiResponse({ status: 200, description: 'Колонка удалена' })
  @Delete('columns/:columnId')
  @UseGuards(AuthGuard('jwt'))
  async deleteColumn(@Req() req, @Param('columnId') columnId: string) {
    return this.infinityLifeService.deleteColumn(columnId, req.user.userId);
  }
}
