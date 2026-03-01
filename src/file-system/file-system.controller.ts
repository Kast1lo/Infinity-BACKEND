import { Controller, Post, Get, Param, Body, UseGuards, UseInterceptors, UploadedFile, Req, Delete, Res, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileSystemService } from './file-system.service';
import { CreateFolderDto } from './DTO/create-folder.dto';
import { UploadFileDto } from './DTO/upload-file.dto';
import { AuthGuard } from '@nestjs/passport';
import { DeleteItemDto } from './DTO/delete-item.dto';
import type { Response } from 'express';

@Controller('file-system')
export class FileSystemController {
  constructor(private readonly fileSystemService: FileSystemService) {}

  @Post('uploadFile')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto
  ){
    return this.fileSystemService.uploadFile(req.user.userId, file, dto);
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

  @Get('download/:id')
  @UseGuards(AuthGuard('jwt'))
  async downloadFile(
    @Req() req, 
    @Param('id') id: string,
    @Res() res: Response
  ) {
    return this.fileSystemService.downloadFile(req.user.userId, id, res);
  }

  @Delete('delete/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteItem(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'file' | 'folder'
  ) {
    return this.fileSystemService.deleteItem(req.user.userId, id, type);
  }
}
