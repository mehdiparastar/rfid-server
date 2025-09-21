import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  PipeTransform,
} from '@nestjs/common';

type FilesBag = { photos?: Express.Multer.File[]; previews?: Express.Multer.File[] };

type Options = {
  maxPerField: number;
  maxSize: number; // bytes, per-file
  mime?: RegExp | string | Array<RegExp | string>; // optional allow-list
};

@Injectable()
export class ValidateProductFilesPipe implements PipeTransform<FilesBag, FilesBag> {
  constructor(private readonly opts: Options) { }

  private isMimeAllowed(mime: string): boolean {
    const allow = this.opts.mime;
    if (!allow) return true;
    const arr = Array.isArray(allow) ? allow : [allow];
    return arr.some((rule) => (rule instanceof RegExp ? rule.test(mime) : mime === rule));
  }

  transform(value: FilesBag): FilesBag {
    const { maxPerField, maxSize } = this.opts;

    if (!!value && !!value.photos && !!value.previews) {
      if (value.photos.length > maxPerField) {
        throw new BadRequestException(`You can upload up to ${maxPerField} photos.`);
      }
      if (value.previews.length > maxPerField) {
        throw new BadRequestException(`You can upload up to ${maxPerField} previews.`);
      }

      const toUploadSize = [...value.photos, ...value.previews].reduce((p, c) => p + c.size, 0) //B
      if (toUploadSize > maxSize) {
        throw new PayloadTooLargeException(
          `your uploading size is ${Math.round(toUploadSize / (1024 * 1024) * 100) / 100} MB, exceeds ${Math.round(maxSize / (1024 * 1024) * 100) / 100} MB, limitation upload size.`,
        );
      }

      for (const f of [...value.photos, ...value.previews]) {
        if (!this.isMimeAllowed(f.mimetype)) {
          throw new BadRequestException(`${f.originalname} has invalid type: ${f.mimetype}`);
        }
      }
    }

    return value;
  }
}
