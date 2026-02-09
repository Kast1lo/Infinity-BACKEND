import { Controller, Post, Get, Param, Body, UseGuards, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileSystemService } from './file-system.service';
import { CreateFolderDto } from './DTO/create-folder.dto';
import { UploadFileDto } from './DTO/upload-file.dto';
import { AuthGuard } from '@nestjs/passport';

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
}
