import { Controller, Post, Get, Param, Body, UseGuards, UseInterceptors, UploadedFile, Req, Delete, Res, Query, UploadedFiles, Patch } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileSystemService } from './file-system.service';
import { CreateFolderDto } from './DTO/create-folder.dto';
import { UploadFileDto } from './DTO/upload-file.dto';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { RenameDto } from './DTO/rename.dto';

@Controller('file-system')
export class FileSystemController {
  constructor(private readonly fileSystemService: FileSystemService) {}


  @Post('uploadFile')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FilesInterceptor('file', 20))
  async upload(
    @Req() req,
    @UploadedFiles() files: Express.Multer.File[], 
    @Body() dto: UploadFileDto
  ) {
    return this.fileSystemService.uploadFiles(req.user.userId, files, dto);
  }

  @Post('createFolder')
  @UseGuards(AuthGuard('jwt'))
  async createFolder(
    @Req() req,
    @Body() dto: CreateFolderDto
  ){
    return this.fileSystemService.createFolder(req.user.userId, dto);
  }

  @Get('tree')
  @UseGuards(AuthGuard('jwt'))
  async getTree(@Req() req) {
    return this.fileSystemService.getFolderTree(req.user.userId);
  }

  @Get('files')
  @UseGuards(AuthGuard('jwt'))
  async getFiles(@Req() req) {
    return this.fileSystemService.getFilesInFolder(req.user.userId, null);
  }

  @Get('files/:folderId')
  @UseGuards(AuthGuard('jwt'))
  async getFilesInFolder(
    @Req() req,
    @Param('folderId') folderId: string
  ) {
    return this.fileSystemService.getFilesInFolder(req.user.userId, folderId);
  }

  @Get('download-folder/:folderId')
  @UseGuards(AuthGuard('jwt'))
  async downloadFolder(
    @Req() req,
    @Param('folderId') folderId: string,
    @Res() res: Response
  ) {
    return this.fileSystemService.downloadFolder(req.user.userId, folderId, res);
  }

  @Get('download/:id')
  @UseGuards(AuthGuard('jwt'))
  async downloadFile(
    @Req() req, 
    @Param('id') id: string,
    @Res() res: Response
  ) {
    return this.fileSystemService.downloadFile(req.user.userId, id, res);
  }
  @Get('share/:username/:filename')
  async getShareFilePublic(
    @Param('username') username: string,
    @Param('filename') filename: string,
  ) {
    console.log(`Public share request: ${username}/${filename}`);

    try {
      const file = await this.fileSystemService.getFileForShare(username, filename);

      const presignedUrl = await this.fileSystemService.getPresignedUrl(file.path);

      return {
        success: true,
        data: {
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          createdAt: file.createdAt,
          downloadUrl: presignedUrl,
        }
      };
    } catch (error: any) {
      console.error('Share error:', error.message);
      return {
        success: false,
        message: error.message || 'Файл не найден'
      };
    }
  }

  @Get('proxy/:id')
  @UseGuards(AuthGuard('jwt'))
  async proxyFile(
    @Req() req,
    @Param('id') id: string,
    @Res() res: Response
  ) {
    return this.fileSystemService.getFileBuffer(req.user.userId, id, res);
  }

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

  @Patch('move/:id')
  @UseGuards(AuthGuard('jwt'))
  async moveFile(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: { folderId: string | null },
  ) {
    return this.fileSystemService.moveFile(req.user.userId, id, dto.folderId);
  }

  @Get('share/download/:username/:filename')
  async downloadFilePublic(
    @Param('username') username: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    await this.fileSystemService.streamFileForShare(username, filename, res);
  }

  @Delete('delete/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteItem(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'file' | 'folder'
  ) {
    console.log('Удаление:', id, type);
    return this.fileSystemService.deleteItem(req.user.userId, id, type);
  }
  
}
