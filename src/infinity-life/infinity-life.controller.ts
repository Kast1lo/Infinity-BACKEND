import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { InfinityLifeService } from './infinity-life.service';
import { AuthGuard } from '@nestjs/passport/dist/auth.guard';
import { CreateTaskDto } from './DTO/create-task.dto';
import { UpdateTaskDto } from './DTO/update-task.dto';

@Controller('infinity-life')
export class InfinityLifeController {
  constructor(private readonly infinityLifeService: InfinityLifeService) {}

  @Post('createTasks')
  @UseGuards(AuthGuard('jwt'))
  async createTask(@Req() req, @Body() createTaskDto: CreateTaskDto) {
    return this.infinityLifeService.createTask(createTaskDto, req.user.userId);
  }

  @Patch('updateTask/:taskId')
  @UseGuards(AuthGuard('jwt'))
  async updateTask(
    @Req() req,
    @Body() updateTaskDto: UpdateTaskDto,
    @Param('taskId') taskId: string
  ) {
    return this.infinityLifeService.updateTask(req.user.userId, updateTaskDto, taskId);
  }
  
  @Patch('toggleTaskCompletion/:taskId')
  @UseGuards(AuthGuard('jwt'))
  async toggleTaskCompletion(
    @Req() req,
    @Param('taskId') taskId: string
  ) {
    return this.infinityLifeService.ToggleTaskCompletion(req.user.userId, taskId);
  }

  @Get('tasksAll')
  @UseGuards(AuthGuard('jwt'))
  async getTasks(@Req() req) {
    return this.infinityLifeService.getAllTasks(req.user.userId);
  }

  @Delete('deleteTask/:taskId')
  @UseGuards(AuthGuard('jwt'))
  async deleteTask(
    @Req() req,
    @Param('taskId') taskId: string
  ) {
    return this.infinityLifeService.deleteTask(req.user.userId, taskId);
  }
}
