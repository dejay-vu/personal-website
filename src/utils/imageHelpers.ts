import type { PhotoExif } from '@/modules/photos/types';
import ExifReader from 'exifreader';

import { fetchMediaURL } from '@/lib/media';

const BLUR_FETCH_TIMEOUT_MS = 20_000;

export async function generateblurDataURL(url: string) {
  const response = await fetchMediaURL(
    url,
    {
      cache: 'no-store',
    },
    BLUR_FETCH_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`Failed to generate blur data URL: ${response.status}`);
  }

  let type = response.headers.get('Content-Type');

  if (!type) type = 'image/svg+xml';

  const arrayBuffer = await response.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString('base64');

  return `data:${type};base64,${base64Data}`;
}

const formattedDateTime = (dateTime: string | undefined) => {
  if (!dateTime) return undefined;

  const [date, time] = dateTime.split(' ');

  return new Date(`${date.replace(/:/g, '-')}T${time}`);
};

export function extractExif(file: Buffer): PhotoExif {
  const {
    FileType,
    Make,
    Model,
    Orientation,
    ['Image Height']: ImageHeight,
    ['Image Width']: ImageWidth,
    BrightnessValue,
    ExposureBiasValue,
    ExposureTime,
    ExposureMode,
    ExposureProgram,
    FNumber,
    FocalLength,
    FocalLengthIn35mmFilm,
    ISOSpeedRatings,
    LensMake,
    LensModel,
    DateTime,
    DateTimeOriginal,
  } = ExifReader.load(file);

  return {
    fileType: FileType?.description ?? null,
    make: Make?.description ?? null,
    model: Model?.description ?? null,
    orientation: Orientation?.description ?? null,
    height: ImageHeight?.value ?? null,
    width: ImageWidth?.value ?? null,
    brightness: BrightnessValue?.description ?? null,
    exposureBias: ExposureBiasValue?.description ?? null,
    exposureTime: ExposureTime?.description ?? null,
    exposureMode: ExposureMode?.description ?? null,
    exposureProgram: ExposureProgram?.description ?? null,
    fNumber: FNumber?.description ?? null,
    focalLength: FocalLength?.description ?? null,
    focalLengthIn35mmFilm: FocalLengthIn35mmFilm?.description
      ? String(FocalLengthIn35mmFilm.description)
      : null,
    iso: ISOSpeedRatings?.description
      ? String(ISOSpeedRatings.description)
      : null,
    lensMake: LensMake?.description ?? null,
    lensModel: LensModel?.description ?? null,
    capturedAt: formattedDateTime(DateTime?.description) ?? null,
    dateTimeOriginal: formattedDateTime(DateTimeOriginal?.description) ?? null,
  };
}
