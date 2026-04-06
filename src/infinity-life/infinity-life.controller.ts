import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InfinityLifeService } from './infinity-life.service';
import { CreateTaskDto } from './DTO/create-task.dto';
import { UpdateTaskDto } from './DTO/update-task.dto';
import { CreateSubtaskDto } from './DTO/create-subtask.dto';
import { UpdateSubtaskDto } from './DTO/update-subtask.dto';

@Controller('infinity-life')
export class InfinityLifeController {
  constructor(private readonly infinityLifeService: InfinityLifeService) {}

  // Tasks
  @Post('tasks')
  @UseGuards(AuthGuard('jwt'))
  async createTask(@Req() req, @Body() dto: CreateTaskDto) {
    return this.infinityLifeService.createTask(dto, req.user.userId);
  }

  @Patch('tasks/:taskId')
  @UseGuards(AuthGuard('jwt'))
  async updateTask(@Req() req, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.infinityLifeService.updateTask(taskId, dto, req.user.userId);
  }

  @Patch('tasks/:taskId/toggle')
  @UseGuards(AuthGuard('jwt'))
  async toggleTaskCompletion(@Req() req, @Param('taskId') taskId: string) {
    return this.infinityLifeService.toggleTaskCompletion(taskId, req.user.userId);
  }

  @Delete('tasks/:taskId')
  @UseGuards(AuthGuard('jwt'))
  async deleteTask(@Req() req, @Param('taskId') taskId: string) {
    return this.infinityLifeService.deleteTask(taskId, req.user.userId);
  }

  @Get('tasks')
  @UseGuards(AuthGuard('jwt'))
  async getUserTasks(@Req() req) {
    return this.infinityLifeService.getUserTasks(req.user.userId);
  }

  @Patch('tasks/:taskId/move')
  @UseGuards(AuthGuard('jwt'))
  async moveTaskToColumn(
    @Req() req, 
    @Param('taskId') taskId: string, 
    @Body() body: { columnId: string }
  ) {
    return this.infinityLifeService.moveTaskToColumn(taskId, body.columnId, req.user.userId);
  }

  // Subtasks
  @Post('subtasks')
  @UseGuards(AuthGuard('jwt'))
  async createSubtask(@Req() req, @Body() dto: CreateSubtaskDto) {
    return this.infinityLifeService.createSubtask(dto, req.user.userId);
  }

  @Patch('subtasks/:subtaskId/toggle')
  @UseGuards(AuthGuard('jwt'))
  async toggleSubtaskCompletion(@Req() req, @Param('subtaskId') subtaskId: string) {
    return this.infinityLifeService.toggleSubtaskCompletion(subtaskId, req.user.userId);
  }

  @Delete('subtasks/:subtaskId')
  @UseGuards(AuthGuard('jwt'))
  async deleteSubtask(@Req() req, @Param('subtaskId') subtaskId: string) {
    return this.infinityLifeService.deleteSubtask(subtaskId, req.user.userId);
  }

  // Columns
  @Post('columns')
  @UseGuards(AuthGuard('jwt'))
  async createColumn(@Req() req, @Body() dto: { name: string }) {
    return this.infinityLifeService.createColumn(dto, req.user.userId);
  }

  @Get('columns')
  @UseGuards(AuthGuard('jwt'))
  async getUserColumns(@Req() req) {
    return this.infinityLifeService.getUserColumns(req.user.userId);
  }

  @Patch('columns/:columnId')
  @UseGuards(AuthGuard('jwt'))
  async updateColumn(@Req() req, @Param('columnId') columnId: string, @Body() dto: { name: string }) {
    return this.infinityLifeService.updateColumn(columnId, dto, req.user.userId);
  }

  @Delete('columns/:columnId')
  @UseGuards(AuthGuard('jwt'))
  async deleteColumn(@Req() req, @Param('columnId') columnId: string) {
    return this.infinityLifeService.deleteColumn(columnId, req.user.userId);
  }
}