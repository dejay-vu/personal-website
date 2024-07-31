export type CustomFile = {
  fileName: string;
  fileType: string;
  content: string;
};

export type ThoughtsPostUploadForm = {
  title: string;
  description?: string | null;
  published?: boolean;
  post: CustomFile[];
  categories: { name: string }[];
};

export type GalleryPhotoUploadForm = {
  title?: string;
  country: string;
  area: string;
  photos: CustomFile[];
};

export type GalleryPhotoExif = {
  fileType?: string | null;
  make?: string | null;
  model?: string | null;
  orientation?: string | null;
  height?: number | null;
  width?: number | null;
  brightness?: string | null;
  exposureBias?: string | null;
  exposureTime?: string | null;
  exposureMode?: string | null;
  exposureProgram?: string | null;
  fNumber?: string | null;
  focalLength?: string | null;
  focalLengthIn35mmFilm?: string | null;
  iso?: string | null;
  lensMake?: string | null;
  lensModel?: string | null;
  dateTime?: Date | null;
  dateTimeOriginal?: Date | null;
};

export type ContactEmailSendForm = {
  name?: string;
  email: string;
  message: string;
  attachments?: CustomFile[];
};
