import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './DTO/create-project.dto';
import { UpdateProjectDto } from './DTO/update-project.dto';
import { AiGenerateTasksDto } from './DTO/ai-generate-tasks.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiCookieAuth,
} from '@nestjs/swagger';

@ApiTags('Projects')
@ApiCookieAuth('access_token')
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @ApiOperation({ summary: 'Создать проект' })
  @ApiBody({ type: CreateProjectDto })
  @ApiResponse({ status: 201, description: 'Проект создан' })
  @ApiResponse({ status: 403, description: 'Превышен лимит проектов для текущего тарифа' })
  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createProject(@Req() req, @Body() dto: CreateProjectDto) {
    return this.projectService.createProject(dto, req.user.userId);
  }

  @ApiOperation({ summary: 'Получить все проекты пользователя' })
  @ApiResponse({ status: 200, description: 'Список проектов' })
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getUserProjects(@Req() req) {
    return this.projectService.getUserProjects(req.user.userId);
  }

  @ApiOperation({ summary: 'Получить проект с колонками, задачами и подзадачами' })
  @ApiParam({ name: 'projectId', description: 'UUID проекта' })
  @ApiResponse({ status: 200, description: 'Проект с вложенными данными' })
  @ApiResponse({ status: 404, description: 'Проект не найден' })
  @Get(':projectId')
  @UseGuards(AuthGuard('jwt'))
  async getProject(@Req() req, @Param('projectId') projectId: string) {
    return this.projectService.getProjectById(projectId, req.user.userId);
  }

  @ApiOperation({ summary: 'Обновить проект' })
  @ApiParam({ name: 'projectId', description: 'UUID проекта' })
  @ApiBody({ type: UpdateProjectDto })
  @ApiResponse({ status: 200, description: 'Проект обновлён' })
  @Patch(':projectId')
  @UseGuards(AuthGuard('jwt'))
  async updateProject(
    @Req() req,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectService.updateProject(projectId, dto, req.user.userId);
  }

  @ApiOperation({ summary: 'Удалить проект (вместе со всеми колонками и задачами)' })
  @ApiParam({ name: 'projectId', description: 'UUID проекта' })
  @ApiResponse({ status: 200, description: 'Проект удалён' })
  @Delete(':projectId')
  @UseGuards(AuthGuard('jwt'))
  async deleteProject(@Req() req, @Param('projectId') projectId: string) {
    return this.projectService.deleteProject(projectId, req.user.userId);
  }

  @ApiOperation({ summary: 'Сгенерировать задачи и подзадачи через GigaChat' })
  @ApiParam({ name: 'projectId', description: 'UUID проекта' })
  @ApiBody({ type: AiGenerateTasksDto })
  @ApiResponse({
    status: 201,
    description: 'Задачи сгенерированы и добавлены в проект',
    schema: {
      example: {
        tasks: [
          {
            id: 'uuid', title: 'Сделать дизайн', notes: '...',
            priority: 'HIGH', subtasks: [{ id: 'uuid', title: 'Скетчи' }],
          },
        ],
        aiUsage: { used: 1, limit: 3 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Превышен дневной лимит AI-генераций' })
  @ApiResponse({ status: 502, description: 'GigaChat недоступен или вернул некорректный ответ' })
  @Post(':projectId/ai-generate')
  @UseGuards(AuthGuard('jwt'))
  async generateTasksWithAi(
    @Req() req,
    @Param('projectId') projectId: string,
    @Body() dto: AiGenerateTasksDto,
  ) {
    return this.projectService.generateTasksWithAi(projectId, dto, req.user.userId);
  }
}
