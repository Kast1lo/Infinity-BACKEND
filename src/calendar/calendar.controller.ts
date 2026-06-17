import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiCookieAuth } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { CreateCalendarTaskDto, UpdateCalendarTaskDto, UpsertCalendarNoteDto } from './DTO/calendar.dto';

@ApiTags('Calendar')
@ApiCookieAuth('access_token')
@Controller('calendar')
@UseGuards(AuthGuard('jwt'))
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @ApiOperation({ summary: 'Данные за месяц (мини-заметки и задачи дней)' })
  @ApiQuery({ name: 'year', example: 2026 })
  @ApiQuery({ name: 'month', example: 6, description: '1–12' })
  @Get('month')
  async getMonth(@Req() req, @Query('year') year: string, @Query('month') month: string) {
    return this.calendar.getMonth(req.user.userId, Number(year), Number(month));
  }

  @ApiOperation({ summary: 'Данные одного дня (мини-заметка + задачи)' })
  @ApiParam({ name: 'date', description: 'YYYY-MM-DD' })
  @Get('day/:date')
  async getDay(@Req() req, @Param('date') date: string) {
    return this.calendar.getDay(req.user.userId, date);
  }

  @ApiOperation({ summary: 'Сохранить мини-заметку дня (пустая — удаляется)' })
  @ApiResponse({ status: 200, description: 'Заметка сохранена' })
  @Post('note')
  async upsertNote(@Req() req, @Body() dto: UpsertCalendarNoteDto) {
    return this.calendar.upsertNote(req.user.userId, dto.date, dto.content ?? '');
  }

  @ApiOperation({ summary: 'Создать задачу на день' })
  @Post('task')
  async createTask(@Req() req, @Body() dto: CreateCalendarTaskDto) {
    return this.calendar.createTask(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'Обновить задачу дня (название / выполнение)' })
  @ApiParam({ name: 'id', description: 'UUID задачи' })
  @Patch('task/:id')
  async updateTask(@Req() req, @Param('id') id: string, @Body() dto: UpdateCalendarTaskDto) {
    return this.calendar.updateTask(req.user.userId, id, dto);
  }

  @ApiOperation({ summary: 'Удалить задачу дня' })
  @ApiParam({ name: 'id', description: 'UUID задачи' })
  @Delete('task/:id')
  async deleteTask(@Req() req, @Param('id') id: string) {
    return this.calendar.deleteTask(req.user.userId, id);
  }
}
