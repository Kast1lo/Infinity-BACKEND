import {
  Controller, Get, Post, Patch, Delete, Body, Param, Req, Res,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiCookieAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './DTO/create-note.dto';
import { UpdateNoteDto } from './DTO/update-note.dto';

@ApiTags('Notes')
@ApiCookieAuth('access_token')
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @ApiOperation({ summary: 'Список заметок пользователя' })
  @ApiResponse({ status: 200, description: 'Заметки (закреплённые сверху)' })
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async list(@Req() req) {
    return this.notes.list(req.user.userId);
  }

  @ApiOperation({ summary: 'Создать заметку' })
  @ApiBody({ type: CreateNoteDto })
  @ApiResponse({ status: 201, description: 'Заметка создана' })
  @Post()
  @UseGuards(AuthGuard('jwt'))
  async create(@Req() req, @Body() dto: CreateNoteDto) {
    return this.notes.create(req.user.userId, dto);
  }

  // ─── Картинки заметок ───

  @ApiOperation({ summary: 'Загрузить картинку в заметку' })
  @ApiResponse({ status: 201, description: 'Возвращает id картинки для вставки' })
  @Post('image')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@Req() req, @UploadedFile() file: Express.Multer.File) {
    return this.notes.uploadImage(req.user.userId, file);
  }

  @ApiExcludeEndpoint()
  @Get('image/:id')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    return this.notes.streamImage(id, res);
  }

  @ApiOperation({ summary: 'Получить заметку' })
  @ApiParam({ name: 'id', description: 'UUID заметки' })
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getOne(@Req() req, @Param('id') id: string) {
    return this.notes.getOne(id, req.user.userId);
  }

  @ApiOperation({ summary: 'Обновить заметку' })
  @ApiParam({ name: 'id', description: 'UUID заметки' })
  @ApiBody({ type: UpdateNoteDto })
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  async update(@Req() req, @Param('id') id: string, @Body() dto: UpdateNoteDto) {
    return this.notes.update(id, req.user.userId, dto);
  }

  @ApiOperation({ summary: 'Удалить заметку' })
  @ApiParam({ name: 'id', description: 'UUID заметки' })
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async remove(@Req() req, @Param('id') id: string) {
    return this.notes.remove(id, req.user.userId);
  }
}
