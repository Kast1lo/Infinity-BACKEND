import {
  Controller, Post, Get, Param, Body, UseGuards, UseInterceptors,
  UploadedFile, Req, Delete, Res, Query, UploadedFiles, Patch,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FileSystemService } from './file-system.service';
import { CreateFolderDto } from './DTO/create-folder.dto';
import { UploadFileDto } from './DTO/upload-file.dto';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { RenameDto } from './DTO/rename.dto';
import { UpdateShareDto } from './DTO/update-share.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiCookieAuth,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('File System')
@Controller('file-system')
export class FileSystemController {
  constructor(private readonly fileSystemService: FileSystemService) {}

  @ApiOperation({ summary: 'Загрузить файлы (до 20 штук)' })
  @ApiCookieAuth('access_token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'array', items: { type: 'string', format: 'binary' } },
        folderId: { type: 'string', example: 'uuid-of-folder' },
        isShared: { type: 'boolean', example: false },
      },
    },
  })
  @ApiResponse({
    status: 201, description: 'Файлы загружены',
    schema: {
      example: [{
        id: 'uuid', name: 'report.pdf', path: 'users/uuid/report.pdf',
        size: '1048576', mimeType: 'application/pdf', isShared: false,
        downloadUrl: 'https://storage.example.com/signed',
      }],
    },
  })
  @ApiResponse({ status: 403, description: 'Превышен лимит хранилища' })
  @Post('uploadFile')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FilesInterceptor('file', 20))
  async upload(
    @Req() req,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadFileDto,
  ) {
    return this.fileSystemService.uploadFiles(req.user.userId, files, dto);
  }

  @ApiOperation({ summary: 'Создать папку' })
  @ApiCookieAuth('access_token')
  @ApiBody({ type: CreateFolderDto })
  @ApiResponse({ status: 201, description: 'Папка создана', schema: { example: { id: 'uuid', name: 'My Docs', path: 'users/uuid/My Docs', ownerId: 'uuid', parentId: null, isShared: false } } })
  @Post('createFolder')
  @UseGuards(AuthGuard('jwt'))
  async createFolder(@Req() req, @Body() dto: CreateFolderDto) {
    return this.fileSystemService.createFolder(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'Получить дерево папок и файлов' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Рекурсивная структура папок с файлами и presigned URL' })
  @Get('tree')
  @UseGuards(AuthGuard('jwt'))
  async getTree(@Req() req) {
    return this.fileSystemService.getFolderTree(req.user.userId);
  }

  @ApiOperation({ summary: 'Получить файлы в корне хранилища' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Список файлов корневого уровня' })
  @Get('files')
  @UseGuards(AuthGuard('jwt'))
  async getFiles(@Req() req) {
    return this.fileSystemService.getFilesInFolder(req.user.userId, null);
  }

  @ApiOperation({ summary: 'Получить файлы внутри папки' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'folderId', description: 'UUID папки' })
  @ApiResponse({ status: 200, description: 'Список файлов в папке' })
  @ApiResponse({ status: 404, description: 'Папка не найдена' })
  @Get('files/:folderId')
  @UseGuards(AuthGuard('jwt'))
  async getFilesInFolder(@Req() req, @Param('folderId') folderId: string) {
    return this.fileSystemService.getFilesInFolder(req.user.userId, folderId);
  }

  @ApiOperation({ summary: 'Скачать папку как ZIP-архив' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'folderId', description: 'UUID папки' })
  @ApiResponse({ status: 200, description: 'ZIP-архив папки (application/zip)' })
  @Get('download-folder/:folderId')
  @UseGuards(AuthGuard('jwt'))
  async downloadFolder(
    @Req() req,
    @Param('folderId') folderId: string,
    @Res() res: Response,
  ) {
    return this.fileSystemService.downloadFolder(req.user.userId, folderId, res);
  }

  @ApiOperation({ summary: 'Скачать файл' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID файла' })
  @ApiResponse({ status: 200, description: 'Бинарное содержимое файла' })
  @ApiResponse({ status: 404, description: 'Файл не найден' })
  @Get('download/:id')
  @UseGuards(AuthGuard('jwt'))
  async downloadFile(
    @Req() req,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.fileSystemService.downloadFile(req.user.userId, id, res);
  }

  @ApiOperation({ summary: 'Получить метаданные публично опубликованного файла (без авторизации)' })
  @ApiParam({ name: 'username', description: 'Имя пользователя-владельца' })
  @ApiParam({ name: 'filename', description: 'Имя файла' })
  @ApiResponse({
    status: 200, description: 'Метаданные файла и presigned ссылка на скачивание',
    schema: {
      example: {
        success: true,
        data: { id: 'uuid', name: 'report.pdf', size: 1048576, mimeType: 'application/pdf', createdAt: '2025-01-01T00:00:00.000Z', downloadUrl: 'https://...' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Файл не найден или не опубликован', schema: { example: { success: false, message: 'Файл не найден' } } })
  @Get('share/:username/:filename')
  async getShareFilePublic(
    @Param('username') username: string,
    @Param('filename') filename: string,
    @Query('password') password?: string,
  ) {
    try {
      const result = await this.fileSystemService.getFileForShare(username, filename, password);

      if ('expired' in result) {
        return { success: false, expired: true, message: 'Срок действия ссылки истёк' };
      }
      if ('requiresPassword' in result && !('ok' in result)) {
        return { success: false, requiresPassword: true, message: 'Требуется пароль' };
      }

      return {
        success: true,
        data: {
          id: result.id,
          name: result.name,
          size: result.size,
          mimeType: result.mimeType,
          createdAt: result.createdAt,
          shareExpiresAt: result.shareExpiresAt,
          requiresPassword: result.requiresPassword,
          downloadUrl: result.downloadUrl,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Файл не найден',
      };
    }
  }

  @ApiOperation({ summary: 'Проксировать содержимое файла (для inline-предпросмотра)' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID файла' })
  @ApiResponse({ status: 200, description: 'Содержимое файла в ответе' })
  @Get('proxy/:id')
  @UseGuards(AuthGuard('jwt'))
  async proxyFile(
    @Req() req,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.fileSystemService.getFileBuffer(req.user.userId, id, res);
  }

  @ApiOperation({ summary: 'Переименовать файл или папку' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID объекта' })
  @ApiQuery({ name: 'type', enum: ['file', 'folder'], description: 'Тип объекта' })
  @ApiBody({ type: RenameDto })
  @ApiResponse({ status: 200, description: 'Объект переименован' })
  @Patch('rename/:id')
  @UseGuards(AuthGuard('jwt'))
  async renameItem(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'file' | 'folder',
    @Body() dto: RenameDto,
  ) {
    return this.fileSystemService.renameItem(req.user.userId, id, type, dto.name);
  }

  @ApiOperation({ summary: 'Переместить файл в другую папку' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID файла' })
  @ApiBody({ schema: { type: 'object', properties: { folderId: { type: 'string', nullable: true, example: 'uuid-of-folder' } } } })
  @ApiResponse({ status: 200, description: 'Файл перемещён' })
  @Patch('move/:id')
  @UseGuards(AuthGuard('jwt'))
  async moveFile(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: { folderId: string | null },
  ) {
    return this.fileSystemService.moveFile(req.user.userId, id, dto.folderId);
  }

  @ApiOperation({ summary: 'Скачать публично опубликованный файл напрямую (без авторизации)' })
  @ApiParam({ name: 'username', description: 'Имя пользователя-владельца' })
  @ApiParam({ name: 'filename', description: 'Имя файла' })
  @ApiResponse({ status: 200, description: 'Поток файла' })
  @Get('share/download/:username/:filename')
  async downloadFilePublic(
    @Param('username') username: string,
    @Param('filename') filename: string,
    @Res() res: Response,
    @Query('password') password?: string,
  ) {
    await this.fileSystemService.streamFileForShare(username, filename, res, password);
  }

  @ApiOperation({ summary: 'Список расшаренных файлов пользователя' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Список публичных ссылок' })
  @Get('shared')
  @UseGuards(AuthGuard('jwt'))
  async getSharedFiles(@Req() req) {
    return this.fileSystemService.getSharedFiles(req.user.userId);
  }

  @ApiOperation({ summary: 'Список избранных файлов и папок' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Избранное пользователя' })
  @Get('starred')
  @UseGuards(AuthGuard('jwt'))
  async getStarred(@Req() req) {
    return this.fileSystemService.getStarred(req.user.userId);
  }

  @ApiOperation({ summary: 'Добавить/убрать из избранного' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID объекта' })
  @ApiQuery({ name: 'type', enum: ['file', 'folder'], description: 'Тип объекта' })
  @ApiResponse({ status: 200, description: 'Состояние избранного переключено' })
  @Patch('star/:id')
  @UseGuards(AuthGuard('jwt'))
  async toggleStar(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'file' | 'folder',
  ) {
    return this.fileSystemService.toggleStar(req.user.userId, id, type);
  }

  @ApiOperation({ summary: 'Настроить публичную ссылку (вкл/выкл, срок, пароль)' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID файла' })
  @ApiBody({ type: UpdateShareDto })
  @ApiResponse({ status: 200, description: 'Настройки ссылки обновлены' })
  @Patch('share/:id')
  @UseGuards(AuthGuard('jwt'))
  async setFileShared(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateShareDto,
  ) {
    return this.fileSystemService.updateShare(req.user.userId, id, {
      isShared: dto.isShared,
      expiresInDays: dto.expiresInDays ?? null,
      password: dto.password,
    });
  }

  @ApiOperation({ summary: 'Удалить файл или папку' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID объекта' })
  @ApiQuery({ name: 'type', enum: ['file', 'folder'], description: 'Тип объекта' })
  @ApiResponse({ status: 200, description: 'Объект удалён' })
  @ApiResponse({ status: 404, description: 'Объект не найден' })
  @Delete('delete/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteItem(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'file' | 'folder',
  ) {
    return this.fileSystemService.deleteItem(req.user.userId, id, type);
  }

  @ApiOperation({ summary: 'Содержимое корзины' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Файлы и папки в корзине' })
  @Get('trash')
  @UseGuards(AuthGuard('jwt'))
  async getTrash(@Req() req) {
    return this.fileSystemService.getTrash(req.user.userId);
  }

  @ApiOperation({ summary: 'Очистить корзину (удалить всё навсегда)' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Корзина очищена' })
  @Delete('trash')
  @UseGuards(AuthGuard('jwt'))
  async emptyTrash(@Req() req) {
    return this.fileSystemService.emptyTrash(req.user.userId);
  }

  @ApiOperation({ summary: 'Восстановить элемент из корзины' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID объекта' })
  @ApiQuery({ name: 'type', enum: ['file', 'folder'], description: 'Тип объекта' })
  @ApiResponse({ status: 200, description: 'Элемент восстановлен' })
  @ApiResponse({ status: 404, description: 'Элемент не найден в корзине' })
  @Patch('restore/:id')
  @UseGuards(AuthGuard('jwt'))
  async restoreItem(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'file' | 'folder',
  ) {
    return this.fileSystemService.restoreItem(req.user.userId, id, type);
  }

  @ApiOperation({ summary: 'Удалить элемент из корзины навсегда' })
  @ApiCookieAuth('access_token')
  @ApiParam({ name: 'id', description: 'UUID объекта' })
  @ApiQuery({ name: 'type', enum: ['file', 'folder'], description: 'Тип объекта' })
  @ApiResponse({ status: 200, description: 'Элемент удалён навсегда' })
  @ApiResponse({ status: 404, description: 'Элемент не найден в корзине' })
  @Delete('trash/:id')
  @UseGuards(AuthGuard('jwt'))
  async permanentDelete(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'file' | 'folder',
  ) {
    return this.fileSystemService.permanentDelete(req.user.userId, id, type);
  }
}
