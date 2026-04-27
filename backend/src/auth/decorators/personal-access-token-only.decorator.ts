import { SetMetadata } from '@nestjs/common';

export const PERSONAL_ACCESS_TOKEN_ONLY_KEY = 'personalAccessTokenOnly';
export const PersonalAccessTokenOnly = () =>
  SetMetadata(PERSONAL_ACCESS_TOKEN_ONLY_KEY, true);
